import { useEffect, useState } from 'preact/hooks';

export type Route =
  | { name: 'home' }
  | { name: 'new' }
  | { name: 'game'; id: string }
  | { name: 'history' }
  | { name: 'stats' }
  | { name: 'settings' }
  /** Invite link: #/join/<one-time invite>. The fragment never reaches any server. */
  | { name: 'join'; code: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  const game = /^\/game\/([A-Za-z0-9-]{1,64})$/.exec(path);
  if (game?.[1]) return { name: 'game', id: game[1] };
  const join = /^\/join\/([0-9A-Za-z-]{1,64})$/.exec(path);
  if (join?.[1]) return { name: 'join', code: join[1] };
  switch (path) {
    case '/new':
      return { name: 'new' };
    case '/history':
      return { name: 'history' };
    case '/stats':
      return { name: 'stats' };
    case '/settings':
      return { name: 'settings' };
    default:
      return { name: 'home' };
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'game':
      return `#/game/${route.id}`;
    case 'join':
      return `#/join/${route.code}`;
    default:
      return `#/${route.name}`;
  }
}

export function navigate(route: Route, replace = false) {
  const target = href(route);
  if (replace) window.location.replace(target);
  else window.location.hash = target;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => {
      window.removeEventListener('hashchange', onChange);
    };
  }, []);
  return route;
}
