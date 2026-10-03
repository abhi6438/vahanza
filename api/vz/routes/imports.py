"""Admin: bulk import of drivers / transporters and invites to join.

Flow: upload file with dry_run=1 (preview: what will happen to each row) -> upload again with dry_run=0
(saves) -> invite by SMS (bulk, needs a DLT template) or WhatsApp (one tap per person, free).
When an imported number logs in, its details are pre-filled (see prospects.claim).
"""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

from .. import prospects as pr
from ..config import get_settings
from ..deps import get_db
from ..importer import ImportError_, analyse, parse, read_table
from ..sms import SmsError, send_flow
from .admin import _audit, admin_ctx

router = APIRouter(prefix="/admin", tags=["admin-import"])
PREVIEW_ROWS = 200
SMS_BATCH = 100
SMS_MAX_PER_CALL = 500


def _brand_name(db, tenant: str) -> str:
    r = db.execute("select name from public.tenants where id = %s", (tenant,)).fetchone()
    return (r or {}).get("name") or tenant.title()


@router.post("/imports")
async def upload(
    request: Request,
    role: Literal["driver", "owner"],
    dry_run: bool = True,
    filename: str = Query("", max_length=120),
    source: str = Query("", max_length=120),
    ctx: dict = Depends(admin_ctx),
    db=Depends(get_db),
):
    data = await request.body()
    try:
        rows = read_table(data, filename)
        info, items = parse(db, rows, role)
    except ImportError_ as e:
        raise HTTPException(422, {"code": e.code, **e.extra})
    counts = analyse(db, ctx["tenant"], items)
    counts["total"] = len(items)

    if dry_run:
        # problems first, then a few good rows as a sample
        shown = [i for i in items if i["status"] == "bad" or i["warnings"]][:PREVIEW_ROWS]
        shown += [i for i in items if i not in shown][: max(0, 20 - len(shown))]
        shown.sort(key=lambda i: i["row"])
        return {**info, "counts": counts, "rows": shown}

    imp = db.execute(
        "insert into public.imports (tenant_id, admin_id, role, filename, source, total, added, updated, on_app, bad) "
        "values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id",
        (ctx["tenant"], ctx["id"], role, filename or None, source.strip() or None, counts["total"],
         counts["new"], counts["update"], counts["on_app"], counts["bad"]),
    ).fetchone()
    keep = [i for i in items if i["status"] in ("new", "update")]
    if keep:
        with db.cursor() as cur:
            cur.executemany(
                """
                insert into public.prospects (tenant_id, import_id, role, phone, name, business_name, district, state,
                                              vehicles, vehicle_count, note)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                on conflict (tenant_id, phone) do update set
                  role = excluded.role,
                  name = coalesce(excluded.name, prospects.name),
                  business_name = coalesce(excluded.business_name, prospects.business_name),
                  district = coalesce(excluded.district, prospects.district),
                  state = coalesce(excluded.state, prospects.state),
                  vehicles = case when cardinality(excluded.vehicles) > 0 then excluded.vehicles else prospects.vehicles end,
                  vehicle_count = coalesce(excluded.vehicle_count, prospects.vehicle_count),
                  note = coalesce(excluded.note, prospects.note)
                where prospects.joined_at is null
                """,
                [(ctx["tenant"], imp["id"], role, i["phone"], i["name"], i["business_name"], i["district"], i["state"],
                  i["vehicles"], i["vehicle_count"], i["note"]) for i in keep],
            )
    _audit(db, ctx, "import", "import", None, f"#{imp['id']} {role}: {counts['new']} new, {counts['update']} updated")
    return {"id": imp["id"], "counts": counts}


@router.get("/imports")
def list_imports(ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    rows = db.execute(
        """
        select i.id, i.role, i.filename, i.source, i.total, i.added, i.updated, i.on_app, i.bad, i.created_at,
               a.name as admin_name,
               (select count(*) from public.prospects p where p.import_id = i.id) as people,
               (select count(*) from public.prospects p where p.import_id = i.id and p.invites > 0) as invited,
               (select count(*) from public.prospects p where p.import_id = i.id and p.joined_at is not null) as joined
        from public.imports i left join public.profiles a on a.id = i.admin_id
        where i.tenant_id = %s order by i.created_at desc limit 50
        """,
        (ctx["tenant"],),
    ).fetchall() or []
    return {"items": [{**dict(r), "created_at": r["created_at"].isoformat()} for r in rows]}


STATUS_SQL = {
    "all": "true",
    "ready": pr.ELIGIBLE_SQL,
    "invited": "p.invites > 0 and p.joined_at is null and not p.opted_out",
    "joined": "p.joined_at is not null",
    "opted_out": "p.opted_out",
}


def _where(ctx, status, role, q, import_id):
    sql = ["p.tenant_id = %(tenant)s", STATUS_SQL[status]]
    params: dict = {"tenant": ctx["tenant"]}
    if role:
        sql.append("p.role = %(role)s")
        params["role"] = role
    if import_id:
        sql.append("p.import_id = %(imp)s")
        params["imp"] = import_id
    digits = "".join(ch for ch in q if ch.isdigit())
    if digits:
        sql.append("p.phone like %(phone)s")
        params["phone"] = f"%{digits}%"
    elif q.strip():
        sql.append("(p.name ilike %(q)s or p.business_name ilike %(q)s or p.district ilike %(q)s)")
        params["q"] = f"%{q.strip()}%"
    return " and ".join(sql), params


@router.get("/prospects")
def list_prospects(
    status: Literal["all", "ready", "invited", "joined", "opted_out"] = "all",
    role: Optional[Literal["driver", "owner"]] = None,
    q: str = Query("", max_length=60),
    import_id: Optional[int] = None,
    offset: int = Query(0, ge=0, le=100000),
    ctx: dict = Depends(admin_ctx),
    db=Depends(get_db),
):
    where, params = _where(ctx, status, role, q, import_id)
    rows = db.execute(
        f"""
        select p.id, p.role, p.phone, p.name, p.business_name, p.district, p.state, p.vehicles, p.vehicle_count,
               p.invites, p.last_invited_at, p.last_channel, p.opted_out, p.joined_at, p.created_at,
               ({pr.ELIGIBLE_SQL}) as can_invite
        from public.prospects p where {where}
        order by p.joined_at desc nulls last, p.created_at desc, p.id desc
        limit 50 offset %(offset)s
        """,
        {**params, "offset": offset},
    ).fetchall() or []
    # counts per status for the filter chips (same role / import / search)
    cw, cp = _where(ctx, "all", role, q, import_id)
    c = db.execute(
        f"""
        select count(*) as all, count(*) filter (where {pr.ELIGIBLE_SQL}) as ready,
               count(*) filter (where {STATUS_SQL['invited']}) as invited,
               count(*) filter (where p.joined_at is not null) as joined,
               count(*) filter (where p.opted_out) as opted_out
        from public.prospects p where {cw}
        """,
        cp,
    ).fetchone() or {}
    iso = lambda v: v.isoformat() if v else None  # noqa: E731
    items = [{**dict(r), "last_invited_at": iso(r["last_invited_at"]), "joined_at": iso(r["joined_at"]),
              "created_at": iso(r["created_at"])} for r in rows]
    return {"items": items, "counts": dict(c), "has_more": len(items) == 50}


@router.get("/invite-config")
def invite_config(ctx: dict = Depends(admin_ctx)):
    s = get_settings()
    return {
        "sms": bool(s.sms_dry_run or (s.msg91_auth_key and s.msg91_invite_template_id)),
        "sms_dry_run": s.sms_dry_run,
        "app_url": s.public_app_url or None,
        "max_invites": pr.MAX_INVITES,
        "gap_days": pr.INVITE_GAP_DAYS,
    }


class SmsInvite(BaseModel):
    ids: Optional[list[int]] = Field(default=None, max_length=SMS_MAX_PER_CALL)
    role: Optional[Literal["driver", "owner"]] = None   # without ids: everyone "ready" (optionally one role / import)
    import_id: Optional[int] = None


@router.post("/prospects/invite-sms")
def invite_sms(body: SmsInvite, ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    s = get_settings()
    if not s.sms_dry_run and not (s.msg91_auth_key and s.msg91_invite_template_id):
        raise HTTPException(409, {"code": "sms_not_ready"})
    if not s.public_app_url:
        raise HTTPException(409, {"code": "no_app_url"})
    where, params = _where(ctx, "ready", body.role, "", body.import_id)
    if body.ids:
        where += " and p.id = any(%(ids)s)"
        params["ids"] = body.ids
    people = db.execute(
        f"select p.id, p.phone, p.name, p.role from public.prospects p where {where} order by p.id limit {SMS_MAX_PER_CALL}",
        params,
    ).fetchall() or []
    if not people:
        return {"sent": 0}
    sent_ids: list[int] = []
    for start in range(0, len(people), SMS_BATCH):
        batch = people[start:start + SMS_BATCH]
        try:
            send_flow(s, s.msg91_invite_template_id, [
                {"mobiles": p["phone"], "name": (p["name"] or "").split(" ")[0] or "ji", "link": pr.invite_link(p["role"])}
                for p in batch
            ])
        except SmsError as e:
            if not sent_ids:
                raise HTTPException(502, {"code": "sms_failed"}) from e
            break
        sent_ids += [p["id"] for p in batch]
    db.execute(
        "update public.prospects set invites = invites + 1, last_invited_at = now(), last_channel = 'sms' where id = any(%s)",
        (sent_ids,),
    )
    _audit(db, ctx, "invite_sms", "prospect", None, f"{len(sent_ids)} people")
    return {"sent": len(sent_ids)}


class WaInvite(BaseModel):
    app_url: Optional[str] = Field(default=None, max_length=200)  # the admin page's own address if the server has none


@router.post("/prospects/{prospect_id}/whatsapp")
def invite_whatsapp(prospect_id: int, body: WaInvite, ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    """Returns a wa.me link with the invite text; the admin sends it from their own WhatsApp."""
    p = db.execute(
        f"select p.id, p.phone, p.name, p.role, ({pr.ELIGIBLE_SQL}) as ok, p.joined_at, p.opted_out "
        "from public.prospects p where p.id = %s and p.tenant_id = %s",
        (prospect_id, ctx["tenant"]),
    ).fetchone()
    if not p:
        raise HTTPException(404, "Not found")
    if not p["ok"]:
        code = "joined" if p["joined_at"] else "opted_out" if p["opted_out"] else "too_soon"
        raise HTTPException(409, {"code": code})
    base = get_settings().public_app_url or (body.app_url or "")
    if not base.startswith(("https://", "http://localhost")):
        raise HTTPException(409, {"code": "no_app_url"})
    text = pr.invite_text(p["role"], p["name"], _brand_name(db, ctx["tenant"]), pr.invite_link(p["role"], base))
    db.execute(
        "update public.prospects set invites = invites + 1, last_invited_at = now(), last_channel = 'whatsapp' where id = %s",
        (prospect_id,),
    )
    return {"url": pr.whatsapp_url(p["phone"], text), "text": text}


class ProspectPatch(BaseModel):
    opted_out: bool


@router.patch("/prospects/{prospect_id}")
def patch_prospect(prospect_id: int, body: ProspectPatch, ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    r = db.execute(
        "update public.prospects set opted_out = %s where id = %s and tenant_id = %s returning id",
        (body.opted_out, prospect_id, ctx["tenant"]),
    ).fetchone()
    if not r:
        raise HTTPException(404, "Not found")
    _audit(db, ctx, "prospect_opt_out" if body.opted_out else "prospect_opt_in", "prospect", None, f"#{prospect_id}")
    return {"id": prospect_id, "opted_out": body.opted_out}


@router.get("/imports/template")
def template(role: Literal["driver", "owner"], ctx: dict = Depends(admin_ctx), db=Depends(get_db)):
    """Ready-to-fill Excel file: dropdowns for city and vehicles, 10-digit check on the mobile number.
    The city list has every district from the pincode directory when it is loaded (else the curated cities)."""
    from ..template import build
    rows = db.execute("select distinct district, state from public.pincodes where district is not null and state is not null").fetchall() or []
    name = "vahanza-drivers.xlsx" if role == "driver" else "vahanza-owners.xlsx"
    return Response(build(role, [(r["district"], r["state"]) for r in rows]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})
