import { getLocalDatabase } from './persistenceService'
import { IntuneService } from '../modules/intune/service'

let servicePromise: Promise<IntuneService> | null = null

/**
 * The one place the app hands the Intune module its storage.
 *
 * The module does not import this file — it takes a store in its constructor —
 * so the dependency runs one way: app knows the module, the module knows only its
 * own tables. That is what makes the folder liftable.
 */
export function getIntuneService(): Promise<IntuneService> {
  if (!servicePromise) {
    servicePromise = getLocalDatabase().then((database) => new IntuneService(database.intune))
    servicePromise.catch(() => {
      servicePromise = null
    })
  }
  return servicePromise
}
