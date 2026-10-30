import { useCallback, useEffect, useRef, useState } from 'react'
import { getErrorMessage } from '../../services/api'

/**
 * Loads admin data. `loading` is true until the first result or error; a failed reload keeps showing the last good data.
 * Pass a changing `key` (e.g. a date range) to refetch. Out-of-order responses are ignored.
 */
export function useAdminData(fetcher, key = '') {
  const [state, setState] = useState({ data: null, error: null, loaded: false })
  const latest = useRef(0)
  const fetcherRef = useRef(fetcher)
  useEffect(() => { fetcherRef.current = fetcher })

  const load = useCallback(() => {
    const id = ++latest.current
    fetcherRef.current()
      .then((data) => { if (id === latest.current) setState({ data, error: null, loaded: true }) })
      .catch((e) => { if (id === latest.current) setState((s) => ({ data: s.data, error: s.loaded ? null : getErrorMessage(e), loaded: s.loaded })) })
  }, [])

  useEffect(() => { load() }, [load, key])
  const reload = useCallback(() => { setState((s) => ({ ...s, error: null })); load() }, [load])
  return { data: state.data, error: state.error, loading: !state.loaded && !state.error, reload }
}
