import { getLocalDatabase } from './persistenceService'
import { DesktopService } from '../modules/desktop/service'

let servicePromise: Promise<DesktopService> | null = null

/**
 * The one place the app hands the bench its storage.
 *
 * The module takes a store in its constructor rather than importing this file,
 * so the dependency runs one way: the app knows the bench, the bench knows only
 * its own table.
 */
export function getDesktopService(): Promise<DesktopService> {
  if (!servicePromise) {
    servicePromise = getLocalDatabase().then((database) => new DesktopService(database.desktop))
    servicePromise.catch(() => {
      servicePromise = null
    })
  }
  return servicePromise
}
