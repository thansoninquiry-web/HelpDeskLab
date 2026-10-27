import { getLocalDatabase } from './persistenceService'
import { NetlabService } from '../modules/netlab/service'

let servicePromise: Promise<NetlabService> | null = null

/**
 * The one place the app hands the Networking Lab its storage.
 *
 * The module does not import this file — it takes a store in its constructor — so
 * the dependency runs one way: the app knows the module, the module knows only
 * its own tables. That is what keeps the folder liftable.
 */
export function getNetlabService(): Promise<NetlabService> {
  if (!servicePromise) {
    servicePromise = getLocalDatabase().then((database) => new NetlabService(database.netlab))
    servicePromise.catch(() => {
      servicePromise = null
    })
  }
  return servicePromise
}
