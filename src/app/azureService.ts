import { getLocalDatabase } from './persistenceService'
import { AzureService } from '../modules/azure/service'

let servicePromise: Promise<AzureService> | null = null

/**
 * The one place the app hands the Azure module its storage.
 *
 * The module does not import this file — it takes a store in its constructor —
 * so the dependency runs one way: app knows the module, the module knows only its
 * own tables. That is what makes the folder liftable.
 */
export function getAzureService(): Promise<AzureService> {
  if (!servicePromise) {
    servicePromise = getLocalDatabase().then((database) => new AzureService(database.azure))
    servicePromise.catch(() => {
      servicePromise = null
    })
  }
  return servicePromise
}
