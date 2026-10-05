import * as A from '../assets/illustrations'
import { VehicleArt } from '../components/form'
import { Badge, Button, Card, Chip, Icon } from '../components/ui'

/** Dev only (/dev/gallery): every illustration, vehicle and primitive, for visual checks in both themes. */
export default function DevGallery() {
  const arts = Object.entries(A)
  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="font-display text-3xl font-semibold">Gallery</h1>
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        {arts.map(([k, C]) => <Card key={k}><C /><p className="text-xs text-text-2">{k}</p></Card>)}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        {['truck', 'bus', 'car', 'jcb', 'tractor', 'auto', 'trailer', 'pickup'].map((v) => <Card key={v} className="w-32 text-center"><VehicleArt kind={v} className="mx-auto h-12 w-20" /><p className="text-xs">{v}</p></Card>)}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button variant="action" icon={Icon.plus}>Action</Button><Button icon={Icon.phone}>Primary</Button><Button variant="success" icon={Icon.phone}>Call</Button>
        <Button variant="outline" icon={Icon.whatsapp}>Outline</Button><Button variant="ghost">Ghost</Button>
        <Chip selected onClick={() => {}} icon={<VehicleArt kind="truck" className="h-4 w-7" />}>Truck</Chip><Chip selected={false} onClick={() => {}}>Bus</Chip>
        <Badge tone="success" icon={Icon.verified}>Verified</Badge><Badge tone="warning">Pending</Badge><Badge>Neutral</Badge>
        <span className="live-dot" />
      </div>
      <div className="surface-hero mt-6 rounded-xl p-6"><div className="max-w-md"><A.HeroRoadArt /></div></div>
    </div>
  )
}
