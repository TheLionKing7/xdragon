/**
 * useMounted — prevents state updates after component unmount
 * PLACE AT: xdragon/app/ui/app/src/hooks/useMounted.ts
 *
 * Usage:
 *   const mounted = useMounted();
 *   useEffect(() => {
 *     fetchData().then(data => {
 *       if (mounted.current) setState(data);
 *     });
 *   }, []);
 */
import { useEffect, useRef } from 'react';

export function useMounted() {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return mounted;
}