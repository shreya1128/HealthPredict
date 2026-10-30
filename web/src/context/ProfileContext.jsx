import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, profileStore } from '../services/api'
import { useAuth } from './AuthContext'

const ProfileContext = createContext(null)

export function ProfileProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [caredForOwners, setCaredForOwners] = useState([])
  const [activeProfile, setActiveProfile] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetchProfiles = useCallback(async () => {
    if (!isAuthenticated) {
      setProfiles([])
      setCaredForOwners([])
      setActiveProfile(null)
      profileStore.setActiveId(null)
      return
    }
    setLoading(true)
    try {
      const [ownRes, caredRes] = await Promise.all([
        api.get('/care-profiles'),
        api.get('/care-profiles/cared-for').catch(() => ({ data: [] })),
      ])
      const own = ownRes.data || []
      const cared = caredRes.data || []
      setProfiles(own)
      setCaredForOwners(cared)

      // Set active profile: default to primary profile if none selected
      setActiveProfile((curr) => {
        if (curr) {
          // Check if current still exists in own or cared
          const existsOwn = own.find((p) => p.id === curr.id)
          if (existsOwn) return existsOwn
          for (const owner of cared) {
            const existsCared = (owner.profiles || []).find((p) => p.id === curr.id)
            if (existsCared) return existsCared
          }
        }
        const primary = own.find((p) => p.is_primary) || own[0] || null
        profileStore.setActiveId(primary ? primary.id : null)
        return primary
      })
    } catch {
      // Ignore network errors on init
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    fetchProfiles()
  }, [fetchProfiles])

  const selectProfile = useCallback((profile) => {
    setActiveProfile(profile)
    profileStore.setActiveId(profile ? profile.id : null)
  }, [])

  const value = useMemo(
    () => ({
      profiles,
      caredForOwners,
      activeProfile,
      loading,
      refreshProfiles: fetchProfiles,
      selectProfile,
    }),
    [profiles, caredForOwners, activeProfile, loading, fetchProfiles, selectProfile],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) {
    return {
      profiles: [],
      caredForOwners: [],
      activeProfile: null,
      loading: false,
      refreshProfiles: async () => {},
      selectProfile: () => {},
    }
  }
  return ctx
}
