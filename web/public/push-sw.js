/* Push for the web app / PWA. Loaded into the generated service worker (vite.config.ts → importScripts). */
self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch (e) { d = { title: event.data && event.data.text() } }
  const title = d.title || 'Vahanza'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: d.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: d.kind || 'vz',
      renotify: true,
      lang: 'hi',
      data: { url: d.url || '/home' },
    }).then(() => self.clients.matchAll({ type: 'window' }))
      .then((list) => list.forEach((c) => c.postMessage({ type: 'vz-push' })))
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/home', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) {
          c.postMessage({ type: 'vz-open', url })
          return c.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
