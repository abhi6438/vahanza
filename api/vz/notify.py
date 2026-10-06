"""Creates notifications (in-app bell) and pushes them to phones.

Called from the routes right after the action that causes them. Rows are inserted with one
INSERT ... SELECT; push goes to at most a few hundred devices per action.
"""
import logging

from psycopg.types.json import Jsonb

from . import push

log = logging.getLogger("vz.notify")
NEW_POST_DAILY_CAP = 5        # a driver gets at most this many "new job near you" pushes per day
NEW_POST_RADIUS_KM = 150
NEW_POST_MAX_DRIVERS = 300

# Push text (the in-app list builds its own text in the app's language).
TEXT = {
    "new_post": {"hi": ("नया काम पास में", "{owner}: {vehicles} के लिए {n} ड्राइवर चाहिए, {savings}/महीना बचत"),
                 "en": ("New job near you", "{owner}: {n} driver(s) for {vehicles}, {savings}/month savings")},
    "new_interest": {"hi": ("नए ड्राइवर ने रुचि दिखाई", "{driver} आपकी पोस्ट के लिए तैयार हैं। प्रोफ़ाइल देखें और कॉल करें।"),
                     "en": ("A driver is interested", "{driver} is interested in your post. See the profile and call.")},
    "interest_seen": {"hi": ("मालिक ने आपकी प्रोफ़ाइल देखी", "{owner} ने आपकी प्रोफ़ाइल देखी। कॉल आ सकता है।"),
                      "en": ("An owner saw your profile", "{owner} looked at your profile. Expect a call.")},
    "post_live": {"hi": ("आपकी पोस्ट लाइव है", "जाँच पूरी हुई। अब पास के ड्राइवर इसे देख सकते हैं।"),
                  "en": ("Your post is live", "The check is done. Drivers near you can see it now.")},
    "post_rejected": {"hi": ("आपकी पोस्ट नहीं लगी", "पोस्ट नियमों के हिसाब से नहीं थी। मदद के लिए हमें कॉल करें।"),
                      "en": ("Your post was not accepted", "The post did not meet the rules. Call us for help.")},
    "profile_views": {"hi": ("मालिक आपकी प्रोफ़ाइल देख रहे हैं", "इस हफ़्ते {n} मालिकों ने आपकी प्रोफ़ाइल देखी। उपलब्ध रहें, कॉल आ सकता है।"),
                      "en": ("Owners are looking at you", "{n} owner(s) viewed your profile this week. Stay available for calls.")},
    "licence_expiry": {"hi": ("लाइसेंस रिन्यू करवाएँ", "आपका ड्राइविंग लाइसेंस {days} दिन में खत्म हो रहा है। समय पर रिन्यू करवाएँ।"),
                       "en": ("Renew your licence", "Your driving licence expires in {days} days. Renew it in time.")},
    "referral_joined": {"hi": ("आपके दोस्त जुड़ गए", "{name} ने प्रोफ़ाइल पूरी की। अब {days} दिन आप लिस्ट में सबसे ऊपर दिखेंगे।"),
                        "en": ("Your friend joined", "{name} finished their profile. You show at the top of lists for {days} days.")},
    "hire_confirm": {"hi": ("क्या आपको काम मिला?", "{owner} ने बताया कि आपको काम पर रखा है। ऐप में हाँ / ना बताएँ।"),
                     "en": ("Did you get the job?", "{owner} says they hired you. Confirm yes / no in the app.")},
    "hire_done": {"hi": ("ड्राइवर ने काम पक्का किया", "{driver} ने बताया कि उन्हें आपके यहाँ काम मिला। उन्हें रेटिंग दें।"),
                  "en": ("Driver confirmed the job", "{driver} confirmed working for you. Give them a rating.")},
    "verify_result": {"hi": ("वेरिफिकेशन का नतीजा", "आपकी फ़ोटो की जाँच हो गई। नतीजा देखने के लिए खोलें।"),
                      "en": ("Verification result", "Your photos were checked. Open to see the result.")},
    "weekly_jobs": {"hi": ("इस हफ़्ते नए काम", "आपके शहर में इस हफ़्ते {n} नए काम आए हैं। देखें और कॉल करें।"),
                    "en": ("New jobs this week", "{n} new jobs came up near you this week. Have a look.")},
    "post_views": {"hi": ("आपकी पोस्ट देखी गई", "इस हफ़्ते {n} ड्राइवरों ने आपकी पोस्ट देखी।"),
                   "en": ("Your post was seen", "{n} drivers looked at your post this week.")},
    "come_back": {"hi": ("आपके लिए नया", "आपके जाने के बाद पास में {n} नए आए हैं। एक बार देख लें।"),
                  "en": ("New for you", "{n} new near you since your last visit. Take a look.")},
    "still_looking": {"hi": ("क्या अभी भी काम ढूंढ रहे हैं?", "एक टैप में बताएँ, ताकि मालिकों को सही लोग दिखें।"),
                      "en": ("Still looking for work?", "Tell us in one tap, so owners see the right people.")},
    "history_request": {"hi": ("क्या ये ड्राइवर आपके यहाँ काम करते थे?", "{driver} ने बताया कि उन्होंने आपके यहाँ गाड़ी चलाई। हाँ या ना बताएँ।"),
                        "en": ("Did this driver work for you?", "{driver} says they drove for you. Tell us yes or no.")},
    "history_answered": {"hi": ("काम के अनुभव पर जवाब आया", "मालिक / Vahanza ने आपके काम के अनुभव का जवाब दिया। देखने के लिए खोलें।"),
                         "en": ("Your work history was answered", "The owner / Vahanza answered your work history. Open to see.")},
}
URL = {"new_post": "/home", "new_interest": "/posts", "interest_seen": "/interests", "post_live": "/posts", "post_rejected": "/posts",
       "profile_views": "/home", "licence_expiry": "/setup?step=licence", "referral_joined": "/invite",
       "hire_confirm": "/home", "hire_done": "/posts", "verify_result": "/verify", "weekly_jobs": "/home",
       "post_views": "/posts", "come_back": "/home", "still_looking": "/home",
       "history_request": "/history-requests", "history_answered": "/history"}
VEHICLE_HI = {"truck": "ट्रक", "trailer": "ट्रेलर", "bus": "बस", "car": "कार", "jcb": "जेसीबी", "tractor": "ट्रैक्टर", "auto": "ऑटो", "pickup": "पिकअप"}


def safe(db, fn, *args, **kw):
    """Run a notify call inside a savepoint so a failure never undoes the user's action."""
    try:
        tx = getattr(db, "transaction", None)
        if tx is None:
            return fn(db, *args, **kw)
        with tx():
            return fn(db, *args, **kw)
    except Exception as e:  # noqa: BLE001
        log.warning("notify %s failed: %s", getattr(fn, "__name__", fn), e)
        return None


def _push_for(db, rows: list[dict]) -> None:
    """rows: notification rows with user_id, kind, data. Looks up devices + language and sends."""
    if not rows or not any(push.configured().values()):
        return
    ids = list({str(r["user_id"]) for r in rows})
    subs = db.execute(
        "select s.id, s.user_id, s.kind, s.endpoint, s.keys, p.lang from public.push_subscriptions s "
        "join public.profiles p on p.id = s.user_id where s.user_id = any(%s::uuid[])",
        (ids,),
    ).fetchall() or []
    by_user: dict[str, list] = {}
    for s in subs:
        by_user.setdefault(str(s["user_id"]), []).append(s)
    msgs = []
    for r in rows:
        for s in by_user.get(str(r["user_id"]), []):
            lang = "en" if s["lang"] == "en" else "hi"
            title, body = TEXT[r["kind"]][lang]
            d = dict(r["data"] or {})
            if lang == "hi" and d.get("vehicles_raw"):
                d["vehicles"] = ", ".join(VEHICLE_HI.get(v, v) for v in d["vehicles_raw"])
            try:
                body = body.format(**{k: d.get(k, "") for k in ("owner", "driver", "vehicles", "n", "savings", "days", "name")})
            except (KeyError, IndexError):
                pass
            msgs.append((s["id"], dict(s), {"title": title, "body": body, "url": URL[r["kind"]], "kind": r["kind"]}))
    try:
        push.send(db, msgs)
    except Exception as e:  # push must never break the action itself
        log.warning("push failed: %s", e)


def to_user(db, tenant: str, user_id: str, kind: str, data: dict, pref: str | None = None) -> None:
    """One notification to one person (skipped if they turned this kind off)."""
    row = db.execute(
        """
        insert into public.notifications (tenant_id, user_id, kind, data)
        select %s, p.id, %s, %s from public.profiles p
        where p.id = %s and not p.blocked and coalesce((p.notify_prefs->>%s)::boolean, true)
        returning user_id, kind, data
        """,
        (tenant, kind, Jsonb(data), user_id, pref or kind),
    ).fetchone()
    if row:
        _push_for(db, [dict(row)])


def new_post(db, post_id: str) -> int:
    """'New job near you' to matching drivers: same test/real world, available, listed, not blocked,
    drives one of the post's vehicles, lives in a base city or within the radius, under the daily cap."""
    rows = db.execute(
        f"""
        with post as (
          select p.id, p.tenant_id, p.owner_id, p.base_cities, p.savings_monthly, o.location, o.is_test,
                 coalesce(o.business_name, o.name) as owner_name,
                 array(select distinct fg.vehicle_type from public.post_groups pg join public.fleet_groups fg on fg.id = pg.fleet_group_id where pg.post_id = p.id) as vehicles,
                 (select coalesce(sum(drivers_needed), 0) from public.post_groups where post_id = p.id) as need
          from public.posts p join public.profiles o on o.id = p.owner_id
          where p.id = %(post)s and p.status = 'live'
        ), targets as (
          select d.id
          from post, public.profiles d join public.driver_details dd on dd.profile_id = d.id
          where d.tenant_id = post.tenant_id and d.role = 'driver' and d.setup_done and not d.blocked
            and d.is_test = post.is_test and dd.is_available and dd.available_from is not null
            and dd.vehicles && post.vehicles
            and coalesce((d.notify_prefs->>'new_post')::boolean, true)
            and not exists (select 1 from public.blocks b where (b.blocker_id = d.id and b.blocked_id = post.owner_id) or (b.blocker_id = post.owner_id and b.blocked_id = d.id))
            and (exists (select 1 from unnest(post.base_cities) c where lower(split_part(c, ',', 1)) = lower(d.district))
                 or (d.location is not null and post.location is not null
                     and extensions.st_dwithin(d.location, post.location, {NEW_POST_RADIUS_KM} * 1000)))
            and (select count(*) from public.notifications n where n.user_id = d.id and n.kind = 'new_post'
                   and n.created_at > now() - interval '1 day') < {NEW_POST_DAILY_CAP}
          order by d.location operator(extensions.<->) post.location nulls last
          limit {NEW_POST_MAX_DRIVERS}
        )
        insert into public.notifications (tenant_id, user_id, kind, data)
        select post.tenant_id, t.id, 'new_post',
               jsonb_build_object('post_id', post.id, 'owner', post.owner_name, 'vehicles_raw', to_jsonb(post.vehicles),
                                  'vehicles', array_to_string(post.vehicles, ', '), 'n', post.need,
                                  'savings', '₹' || to_char(post.savings_monthly, 'FM99,99,999'))
        from post, targets t
        returning user_id, kind, data
        """,
        {"post": post_id},
    ).fetchall() or []
    _push_for(db, [dict(r) for r in rows])
    return len(rows)
