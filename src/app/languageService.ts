import { getLocalDatabase } from './persistenceService'
import { LanguageService } from '../modules/languages/service'

let servicePromise: Promise<LanguageService> | null = null

/**
 * The one place the app hands the language tracks their storage.
 *
 * The module does not import this file — it takes a store in its constructor —
 * so the dependency runs one way and the folder stays liftable, the same
 * bargain the two consoles and the algorithm drill keep.
 */
export function getLanguageService(): Promise<LanguageService> {
  if (!servicePromise) {
    servicePromise = getLocalDatabase().then((database) => new LanguageService(database.languages))
    servicePromise.catch(() => {
      servicePromise = null
    })
  }
  return servicePromise
}
