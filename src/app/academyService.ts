import { getLocalDatabase } from './persistenceService'
import { AcademyService } from '../modules/academy/service'

let servicePromise: Promise<AcademyService> | null = null

/**
 * The one place the app hands the school desk its storage.
 *
 * The module takes a store in its constructor rather than importing this file, * so the dependency runs one way: the app knows the desk, the desk knows only
 * its own table.
 */
export function getAcademyService(): Promise<AcademyService> {
  if (!servicePromise) {
    servicePromise = getLocalDatabase().then((database) => new AcademyService(database.academy))
    servicePromise.catch(() => {
      servicePromise = null
    })
  }
  return servicePromise
}
