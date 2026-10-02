import { useTranslation } from 'react-i18next'
import { Screen, TopBar } from '../components/ui'
import { brand } from '../lib/brand'

export default function Legal() {
  const { t } = useTranslation()
  return (
    <>
      <TopBar title={t('legal.title')} />
      <Screen>
        <p className="whitespace-pre-line leading-relaxed">{t('legal.body')}</p>
        <p className="mt-4 text-sm text-muted">{brand.grievanceOfficer.name} · {brand.grievanceOfficer.email}</p>
      </Screen>
    </>
  )
}
