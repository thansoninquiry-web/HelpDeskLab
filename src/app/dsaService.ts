import { getLocalDatabase } from './persistenceService'
import { DsaService } from '../modules/dsa/service'

let servicePromise: Promise<DsaService> | null = null

/**
 * The one place the app hands the DSA module its storage.
 *
 * The module does not import this file — it takes a store in its constructor —
 * so the dependency runs one way and the folder stays liftable.
 */
export function getDsaService(): Promise<DsaService> {
  if (!servicePromise) {
    servicePromise = getLocalDatabase().then((database) => new DsaService(database.dsa))
    servicePromise.catch(() => {
      servicePromise = null
    })
  }
  return servicePromise
}
