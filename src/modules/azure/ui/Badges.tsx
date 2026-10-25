import type { AzureResource, Exposure } from '../types'
import { EXPOSURE_LABELS } from './labels'
import styles from './azure.module.css'

export function ExposureBadge({ exposure }: { exposure: Exposure }) {
  return (
    <span className={styles.badge} data-tone={exposure}>
      {EXPOSURE_LABELS[exposure]}
    </span>
  )
}

/** The one state a reader looks for first, per kind of resource. */
function stateLabel(resource: AzureResource): string {
  const properties = resource.properties
  switch (properties.kind) {
    case 'vm':
      return properties.power === 'running' ? 'Running' : 'Deallocated'
    case 'storage':
      return properties.publicBlobAccess ? 'Public blobs' : 'Private'
    case 'nsg':
      return properties.attachedTo
    case 'webapp':
      return properties.planSku
  }
}

export function StateBadge({ resource }: { resource: AzureResource }) {
  const properties = resource.properties
  const tone =
    (properties.kind === 'vm' && properties.power === 'deallocated') ||
    (properties.kind === 'storage' && properties.publicBlobAccess)
      ? 'high'
      : 'low'
  return (
    <span className={styles.badge} data-tone={tone}>
      {stateLabel(resource)}
    </span>
  )
}
