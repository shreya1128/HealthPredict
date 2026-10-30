import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Users, HeartHandshake } from 'lucide-react'
import { useProfile } from '../../context/ProfileContext'

export default function ProfileSwitcher() {
  const { profiles, caredForOwners, activeProfile, selectProfile } = useProfile()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!profiles || profiles.length === 0) {
    return null
  }

  const displayName = activeProfile?.full_name || 'My Profile'

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition focus:outline-none focus:ring-2 focus:ring-teal-500"
        title="Switch family member or person you care for"
        aria-label="Switch active profile"
        aria-expanded={open}
      >
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
          style={{ backgroundColor: activeProfile?.avatar_color || '#0f766e' }}
        >
          {displayName.charAt(0).toUpperCase()}
        </div>
        <span className="truncate max-w-[120px]">{displayName}</span>
        {activeProfile?.is_child && (
          <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[10px] rounded-md font-medium">Child</span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50 text-xs text-slate-700">
          <div className="px-3 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            <span>My Family</span>
          </div>
          {profiles.map((p) => {
            const isSelected = activeProfile?.id === p.id
            return (
              <button
                key={p.id}
                onClick={() => {
                  selectProfile(p)
                  setOpen(false)
                }}
                className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 transition ${
                  isSelected ? 'bg-teal-50/60 text-teal-800 font-semibold' : ''
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                    style={{ backgroundColor: p.avatar_color || '#0f766e' }}
                  >
                    {p.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="truncate">
                    <p className="truncate font-medium">{p.full_name}</p>
                    <p className="text-[10px] text-slate-400">
                      {p.is_primary ? 'Primary (Me)' : (p.relationship || 'Family')}
                    </p>
                  </div>
                </div>
                {isSelected && <Check className="w-4 h-4 text-teal-600 shrink-0" />}
              </button>
            )
          })}

          {caredForOwners.length > 0 && (
            <>
              <div className="border-t border-slate-100 my-1"></div>
              <div className="px-3 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <HeartHandshake className="w-3.5 h-3.5 text-teal-600" />
                <span>People I Care For</span>
              </div>
              {caredForOwners.map((owner) => (
                <div key={owner.owner_id} className="mb-1">
                  <div className="px-3 py-0.5 text-[10px] font-semibold text-slate-500">
                    {owner.owner_name} ({owner.access_level === 'EDIT' ? 'Can Edit' : 'View Only'})
                  </div>
                  {(owner.profiles || []).map((p) => {
                    const isSelected = activeProfile?.id === p.id
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          selectProfile({ ...p, access_level: owner.access_level })
                          setOpen(false)
                        }}
                        className={`w-full pl-6 pr-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-50 transition ${
                          isSelected ? 'bg-teal-50/60 text-teal-800 font-semibold' : ''
                        }`}
                      >
                        <span className="truncate">{p.full_name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-teal-600 shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
