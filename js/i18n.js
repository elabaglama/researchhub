/**
 * Lightweight i18n — Italian default, English toggle.
 * Usage: import { t, initI18n, getLang, toggleLang } from './i18n.js';
 * HTML: <element data-i18n="key"> or <input data-i18n-ph="key" />
 */

const LANG_KEY = "hub-lang";
export const DEFAULT_LANG = "it";

const T = {
  it: {
    // nav
    "nav.daily":   "Report Giornaliero",
    "nav.library": "Libreria",
    "nav.guide":   "Guida",
    "nav.search":  "Cerca",
    // home
    "search.placeholder": "cerca",
    "filter.allTypes":    "Tutti i tipi",
    "filter.jobs":        "Lavoro e Tirocini",
    "filter.programs":    "Programmi e Borse di Studio",
    "filter.awards":      "Sovvenzioni e Premi",
    "filter.calls":       "Bandi di Partnership",
    "filter.events":      "Eventi e Corsi",
    "filter.other":       "Opportunità",
    "filter.anyRegion":   "Qualsiasi regione",
    "filter.africa":      "Africa",
    "filter.asia":        "Asia",
    "filter.europe":      "Europa",
    "filter.americas":    "Americhe",
    "filter.middleeast":  "Medio Oriente",
    "filter.oceania":     "Oceania",
    "filter.country":     "Paese…",
    // search results
    "results.export":  "Esporta XLS",
    "results.noMatch": "Nessun risultato trovato.",
    "results.open":    "Apri originale →",
    "results.save":    "Salva su Notion",
    "results.saving":  "Salvataggio…",
    "results.saved":   "Salvato",
    "results.failed":  "Errore",
    "results.for":     "per",
    "results.count1":  "risultato",
    "results.countN":  "risultati",
    // library
    "lib.title":           "Libreria",
    "lib.lede":            "Aggiungi un link, poi clicca sincronizza per aggiornare il tuo feed.",
    "lib.syncAll":         "Sincronizza tutto",
    "lib.urlLabel":        "Link al sito web",
    "lib.urlPlaceholder":  "https://esempio.com",
    "lib.saveBtn":         "Salva e indicizza",
    "lib.cancel":          "Annulla",
    "lib.rescrape":        "Ri-indicizza",
    "lib.remove":          "Rimuovi",
    "lib.removing":        "Rimozione…",
    "lib.removed":         "Rimosso dalla tua libreria.",
    "lib.share":           "Condividi",
    "lib.bulkImport":      "Importa in blocco",
    "lib.bulkPlaceholder": "Un link per riga…",
    "lib.bulkAdd":         "Aggiungi tutti",
    "lib.empty":           "La tua libreria è vuota. Aggiungi una risorsa per iniziare il tuo feed personale — Sincronizza indicizza solo ciò che hai aggiunto.",
    "lib.signIn":          "Accedi per gestire la tua libreria personale.",
    "lib.statusLibrary":   "Libreria",
    "lib.statusScraping":  "Indicizzando…",
    "lib.statusFailed":    "Indicizzazione fallita",
    "lib.statusReady":     "Pronto",
    "lib.saving":          "Salvataggio e indicizzazione…",
    "lib.saved":           "salvato.",
    "lib.confirmRemove":   "Rimuovere questa fonte dalla tua libreria?",
    "lib.importTitle":     "Importa Libreria",
    "lib.importConfirm":   "Vuoi importare {n} risorse in questa libreria?",
    "lib.importBtn":       "Importa",
    "lib.importClose":     "✕",
    "lib.importDone":      "Importazione completata.",
    "lib.shareTitle":      "Libreria condivisa",
    "lib.shareCopied":     "Link copiato! Chiunque abbia il link può importare le tue risorse.",
    "lib.syncReady":       "Sincronizzato — le indicizzazioni sono in esecuzione. Home e Report Giornaliero si aggiornano quando ogni fonte termina.",
    // daily
    "daily.title":     "Report Giornaliero",
    "daily.greeting":  "Ecco il tuo rapporto quotidiano.",
    "daily.customize": "⚙ Personalizza",
    "daily.done":      "Fatto",
    "daily.prefsTitle":"Personalizza Report",
    "daily.prefsHint": "Attiva le sezioni da visualizzare nel tuo report giornaliero.",
    "daily.noOpp":     "Nessuna opportunità disponibile per le categorie selezionate ancora. Prova a sincronizzare dalla Libreria.",
    "daily.emptyLib":  "La tua libreria è vuota. Aggiungi risorse nella Libreria, poi Sincronizza per riempire il tuo report giornaliero.",
    // notion
    "notion.connect":    "Connetti Notion",
    "notion.connected":  "Notion",
    "notion.connectOnce":"Connetti una volta. Dopo questo, ogni Salva su Notion è un clic.",
    "notion.secret":     "Segreto di integrazione",
    "notion.dbId":       "ID Database",
    "notion.saveTest":   "Salva e testa connessione",
    "notion.disconnect": "Disconnetti",
    "notion.heading":    "Connetti Notion",
    // guide
    "guide.step1.title": "Benvenuta!",
    "guide.step1.body":  "Stai cercando in diversi siti per trovare opportunità?<br>Inizia ad aggiungere i link salvati di siti con bandi aperti, risorse e gruppi Facebook pubblici che segui nella pagina <strong>Libreria</strong>.",
    "guide.step2.title": "Cerca tra tutte insieme.",
    "guide.step2.body":  "Usa la funzione di ricerca per trovare istantaneamente opportunità in ogni fonte che hai aggiunto, tutte nello stesso momento.",
    "guide.step3.title": "C'è musica di sottofondo.",
    "guide.step3.body":  "È scelta da Ela. Non puoi ancora cambiarla.",
    "guide.step4.title": "Nessun pagamento necessario.",
    "guide.step4.body":  "Questo strumento è completamente gratuito per te ma accettiamo regali fisici.",
    "guide.step5.title": "Nessun problema di sicurezza.",
    "guide.step5.body":  "Niente è controllato da META, Google o Apple. Creato privatamente per FELCOS.",
    "guide.next":  "Avanti →",
    "guide.back":  "← Indietro",
    "guide.start": "Iniziamo!",
    "guide.wishlist": "Lista dei desideri di Ela",
    // lang toggle
    "lang.toggle": "EN",
  },
  en: {
    "nav.daily":   "Daily Report",
    "nav.library": "Library",
    "nav.guide":   "Guide",
    "nav.search":  "Search",
    "search.placeholder": "search",
    "filter.allTypes":    "All types",
    "filter.jobs":        "Jobs & Internships",
    "filter.programs":    "Programs & Scholarships",
    "filter.awards":      "Grants & Awards",
    "filter.calls":       "Partnership Calls",
    "filter.events":      "Events & Classes",
    "filter.other":       "Opportunities",
    "filter.anyRegion":   "Any region",
    "filter.africa":      "Africa",
    "filter.asia":        "Asia",
    "filter.europe":      "Europe",
    "filter.americas":    "Americas",
    "filter.middleeast":  "Middle East",
    "filter.oceania":     "Oceania",
    "filter.country":     "Country…",
    "results.export":  "Export XLS",
    "results.noMatch": "No matches found.",
    "results.open":    "Open original →",
    "results.save":    "Save to Notion",
    "results.saving":  "Saving…",
    "results.saved":   "Saved",
    "results.failed":  "Failed",
    "results.for":     "for",
    "results.count1":  "result",
    "results.countN":  "results",
    "lib.title":           "Library",
    "lib.lede":            "Add a link, then click sync to refresh your feed.",
    "lib.syncAll":         "Sync all",
    "lib.urlLabel":        "Website link",
    "lib.urlPlaceholder":  "https://example.com",
    "lib.saveBtn":         "Save & scrape",
    "lib.cancel":          "Cancel",
    "lib.rescrape":        "Re-scrape",
    "lib.remove":          "Remove",
    "lib.removing":        "Removing…",
    "lib.removed":         "Removed from your library.",
    "lib.share":           "Share",
    "lib.bulkImport":      "Import bulk",
    "lib.bulkPlaceholder": "One link per line…",
    "lib.bulkAdd":         "Add all",
    "lib.empty":           "Your library is empty. Add a resource to start building your personal feed — Sync scrapes only what you added.",
    "lib.signIn":          "Sign in to manage your personal library.",
    "lib.statusLibrary":   "Library",
    "lib.statusScraping":  "Scraping…",
    "lib.statusFailed":    "Scrape failed",
    "lib.statusReady":     "Ready",
    "lib.saving":          "Saving & scraping…",
    "lib.saved":           "saved.",
    "lib.confirmRemove":   "Remove this source from your library?",
    "lib.importTitle":     "Import Library",
    "lib.importConfirm":   "Import {n} resources into your library?",
    "lib.importBtn":       "Import",
    "lib.importClose":     "✕",
    "lib.importDone":      "Import complete.",
    "lib.shareTitle":      "Shared Library",
    "lib.shareCopied":     "Link copied! Anyone with the link can import your resources.",
    "lib.syncReady":       "Synced — scrapes are running in the cloud. Home and Daily update when each source finishes.",
    "daily.title":     "Daily Report",
    "daily.greeting":  "Here is your daily report.",
    "daily.customize": "⚙ Customize",
    "daily.done":      "Done",
    "daily.prefsTitle":"Customize Report",
    "daily.prefsHint": "Toggle the sections you want to see in your daily report.",
    "daily.noOpp":     "No opportunities available for the selected categories yet. Try Sync on the Library page.",
    "daily.emptyLib":  "Your library is empty. Add resources on the Library page, then Sync to fill your daily report.",
    "notion.connect":    "Connect Notion",
    "notion.connected":  "Notion",
    "notion.connectOnce":"Connect once. After this, every Save to Notion is one click.",
    "notion.secret":     "Integration secret",
    "notion.dbId":       "Database ID",
    "notion.saveTest":   "Save & test connection",
    "notion.disconnect": "Disconnect",
    "notion.heading":    "Connect Notion",
    "guide.step1.title": "Welcome!",
    "guide.step1.body":  "Are you searching in different links to find opportunities?<br>Start adding your saved links of open call websites, resources and even public Facebook groups you follow to the <strong>Library</strong> page.",
    "guide.step2.title": "Search through all of them at once.",
    "guide.step2.body":  "Use the search feature to instantly find opportunities across every source you've added, all at the same time.",
    "guide.step3.title": "There's background music.",
    "guide.step3.body":  "It's picked by Ela. You can't change it yet.",
    "guide.step4.title": "No payments needed.",
    "guide.step4.body":  "This tool is completely free for you. Ela accepts only physical gifts.",
    "guide.step5.title": "No security issues.",
    "guide.step5.body":  "Nothing is controlled by META, Google or Apple. Made for FELCOS privately.",
    "guide.next":  "Next →",
    "guide.back":  "← Back",
    "guide.start": "Let's go!",
    "guide.wishlist": "Ela's wishlist",
    "lang.toggle": "IT",
  },
};

export function getLang() {
  return localStorage.getItem(LANG_KEY) || DEFAULT_LANG;
}

export function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
  document.documentElement.lang = lang;
}

export function t(key, vars = {}) {
  const lang = getLang();
  let val = (T[lang] || T[DEFAULT_LANG])[key] || T.en[key] || key;
  for (const [k, v] of Object.entries(vars)) {
    val = val.replace(`{${k}}`, v);
  }
  return val;
}

export function initI18n() {
  const lang = getLang();
  document.documentElement.lang = lang;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    const val = t(key);
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      el.placeholder = val;
    } else {
      el.textContent = val;
    }
  });

  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });

  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh);
  });

  // Language toggle button label
  document.querySelectorAll(".lang-toggle-btn").forEach((btn) => {
    btn.textContent = t("lang.toggle");
    btn.title = lang === "it" ? "Switch to English" : "Passa all'italiano";
  });
}

export function toggleLang() {
  const next = getLang() === "it" ? "en" : "it";
  setLang(next);
  initI18n();
  window.dispatchEvent(new CustomEvent("langchange"));
}
