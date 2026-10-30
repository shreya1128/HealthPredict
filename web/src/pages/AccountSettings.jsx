import { ArrowDownToLine, Heart, Trash2, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { careProfileService } from '../services/careProfileService'
import { profileService } from '../services/healthService'
import { authService } from '../services/authService'
import { useAuth } from '../context/AuthContext'
import { Alert, inputClass } from '../components/common/Feedback'
import { getErrorMessage } from '../services/api'

export default function AccountSettings() {
  const { user, logout } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [caregivers, setCaregivers] = useState([])
  const [sessions, setSessions] = useState([])
  const [newProfileName, setNewProfileName] = useState('')
  const [newProfileRel, setNewProfileRel] = useState('CHILD')
  const [inviteEmail, setInviteEmail] = useState('')
  const [actionMsg, setActionMsg] = useState('')
  const [actionErr, setActionErr] = useState('')

  // Security Center state
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmNewPw, setConfirmNewPw] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [emailPw, setEmailPw] = useState('')
  const [secLoading, setSecLoading] = useState(false)

  // 2FA state
  const [totpSetupData, setTotpSetupData] = useState(null)
  const [totpCode, setTotpCode] = useState('')
  const [showDisableTotp, setShowDisableTotp] = useState(false)
  const [disableTotpPw, setDisableTotpPw] = useState('')
  const [disableTotpCode, setDisableTotpCode] = useState('')

  // Account delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  // Timezone state
  const [userTz, setUserTz] = useState(user?.timezone || 'UTC')
  const [tzUpdating, setTzUpdating] = useState(false)

  useEffect(() => {
    if (user?.timezone) setUserTz(user.timezone)
  }, [user?.timezone])

  async function handleSetDeviceTz() {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      setTzUpdating(true)
      await profileService.update({ timezone: detected })
      setUserTz(detected)
      setActionMsg(`Timezone updated to ${detected}`)
    } catch (err) {
      setActionErr(getErrorMessage(err))
    } finally {
      setTzUpdating(false)
    }
  }

  const load = async () => {
    try {
      const [p, c, s] = await Promise.all([
        careProfileService.list(),
        careProfileService.listCaregivers(),
        authService.listSessions().catch(() => []),
      ])
      setProfiles(p || [])
      setCaregivers(c || [])
      setSessions(s || [])
    } catch {
      // silently handle
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    if (!currentPw || !newPw) return
    setActionErr('')
    setActionMsg('')
    setSecLoading(true)
    try {
      await authService.changePassword(currentPw, newPw, confirmNewPw)
      setActionMsg('Password updated successfully. Please log in again with your new password.')
      setCurrentPw('')
      setNewPw('')
      setConfirmNewPw('')
      setTimeout(() => logout(), 2000)
    } catch (err) {
      setActionErr(getErrorMessage(err))
    } finally {
      setSecLoading(false)
    }
  }

  async function handleChangeEmail(e) {
    e.preventDefault()
    if (!newEmail || !emailPw) return
    setActionErr('')
    setActionMsg('')
    setSecLoading(true)
    try {
      await authService.changeEmail(newEmail, emailPw)
      setActionMsg('Verification email sent to your new email address. Please check your inbox.')
      setNewEmail('')
      setEmailPw('')
    } catch (err) {
      setActionErr(getErrorMessage(err))
    } finally {
      setSecLoading(false)
    }
  }

  async function handleStartTotpSetup() {
    setActionErr('')
    setActionMsg('')
    setSecLoading(true)
    try {
      const res = await authService.setupTotp()
      setTotpSetupData(res)
    } catch (err) {
      setActionErr(getErrorMessage(err))
    } finally {
      setSecLoading(false)
    }
  }

  async function handleConfirmTotp() {
    if (!totpCode || !totpSetupData) return
    setActionErr('')
    setActionMsg('')
    try {
      await authService.enableTotp(totpSetupData.secret, totpCode)
      setActionMsg('Two-factor authentication successfully enabled!')
      setTotpSetupData(null)
      setTotpCode('')
      load()
    } catch (err) {
      setActionErr(getErrorMessage(err))
    }
  }

  async function handleDisableTotp() {
    if (!disableTotpPw || !disableTotpCode) return
    setActionErr('')
    setActionMsg('')
    try {
      await authService.disableTotp(disableTotpPw, disableTotpCode)
      setActionMsg('Two-factor authentication has been disabled.')
      setShowDisableTotp(false)
      setDisableTotpPw('')
      setDisableTotpCode('')
      load()
    } catch (err) {
      setActionErr(getErrorMessage(err))
    }
  }

  async function handleRevokeSession(sessionId) {
    try {
      await authService.revokeSession(sessionId)
      load()
    } catch (err) {
      setActionErr(getErrorMessage(err))
    }
  }

  async function handleRevokeAllOtherSessions() {
    try {
      await authService.revokeAllSessions()
      load()
    } catch (err) {
      setActionErr(getErrorMessage(err))
    }
  }

  async function handleExportJson() {
    try {
      const data = await authService.exportDataJson()
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2))
      const dlAnchor = document.createElement('a')
      dlAnchor.setAttribute('href', dataStr)
      dlAnchor.setAttribute('download', `healthpredict_export_${user?.id || 'data'}.json`)
      document.body.appendChild(dlAnchor)
      dlAnchor.click()
      dlAnchor.remove()
    } catch (err) {
      setActionErr(getErrorMessage(err))
    }
  }

  function handleExportZip() {
    window.open('/api/auth/account/export?format=zip', '_blank')
  }

  async function handleExecuteDeleteAccount() {
    if (deleteConfirmText !== 'DELETE' || !deletePassword) return
    setActionErr('')
    try {
      await authService.deleteAccount(deletePassword, deleteConfirmText)
      alert('Your account and all medical records have been permanently erased.')
      logout()
    } catch (err) {
      setActionErr(getErrorMessage(err))
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleAddProfile(e) {
    e.preventDefault()
    if (!newProfileName.trim()) return
    setActionErr('')
    setActionMsg('')
    try {
      await careProfileService.create({ full_name: newProfileName.trim(), relationship: newProfileRel })
      setNewProfileName('')
      setActionMsg('Family profile added successfully!')
      load()
    } catch (err) {
      setActionErr(getErrorMessage(err))
    }
  }

  async function handleInviteCaregiver(e) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setActionErr('')
    setActionMsg('')
    try {
      await careProfileService.inviteCaregiver({ caregiver_email: inviteEmail.trim(), access_level: 'VIEW_ONLY' })
      setInviteEmail('')
      setActionMsg('Caregiver invitation link created and sent!')
      load()
    } catch (err) {
      setActionErr(getErrorMessage(err))
    }
  }

  async function handleDeleteProfile(id) {
    if (!window.confirm('Are you sure you want to delete this profile?')) return
    try {
      await careProfileService.delete(id)
      load()
    } catch (err) {
      setActionErr(getErrorMessage(err))
    }
  }

  return (
    <div className="space-y-8">
      {actionMsg && <Alert kind="success">{actionMsg}</Alert>}
      {actionErr && <Alert>{actionErr}</Alert>}

      {/* 1. Family & Care Profiles */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <Users className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-slate-900">Family & Care Profiles</h2>
            <p className="text-sm text-slate-500">Manage health records and reminders for yourself and your family.</p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {profiles.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: p.avatar_color || '#0f766e' }}>
                  {p.full_name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{p.full_name} {p.is_primary && <span className="text-xs bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full font-medium ml-1">Primary (You)</span>}</p>
                  <p className="text-xs text-slate-500 capitalize">{p.relationship.toLowerCase()}</p>
                </div>
              </div>
              {!p.is_primary && (
                <button onClick={() => handleDeleteProfile(p.id)} className="text-slate-400 hover:text-red-600 p-1.5 transition" title="Delete profile">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add profile form */}
        <form onSubmit={handleAddProfile} className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-slate-700 mb-1">Add Family Member</label>
            <input value={newProfileName} onChange={(e) => setNewProfileName(e.target.value)} placeholder="e.g. John Doe" className={inputClass(false)} />
          </div>
          <div className="w-36">
            <label className="block text-xs font-medium text-slate-700 mb-1">Relationship</label>
            <select value={newProfileRel} onChange={(e) => setNewProfileRel(e.target.value)} className={inputClass(false)}>
              <option value="CHILD">Child</option>
              <option value="PARENT">Parent</option>
              <option value="SPOUSE">Spouse</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <button type="submit" className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 transition">
            Add Profile
          </button>
        </form>
      </section>

      {/* 2. Caregiver Sharing */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <Heart className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-slate-900">Caregiver Access</h2>
            <p className="text-sm text-slate-500">Allow a trusted person or nurse to view adherence and missed dose alerts.</p>
          </div>
        </div>

        <form onSubmit={handleInviteCaregiver} className="mt-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-slate-700 mb-1">Caregiver Email</label>
            <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="caregiver@example.com" className={inputClass(false)} />
          </div>
          <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition">
            Send Invite
          </button>
        </form>

        {caregivers.length > 0 && (
          <div className="mt-4 space-y-2">
            {caregivers.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 text-sm">
                <span className="font-medium text-slate-800">{c.caregiver_email}</span>
                <div className="flex items-center gap-2">
                  {c.email_delivered ? (
                    <span className="text-2xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                      Email Delivered
                    </span>
                  ) : c.email_delivery_status === 'FAILED' ? (
                    <span className="text-2xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-medium">
                      Email Failed
                    </span>
                  ) : (
                    <span className="text-2xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-medium">
                      Email {c.email_delivery_status || 'Queued'}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    c.status === 'ACCEPTED' ? 'bg-teal-100 text-teal-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {c.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. Security Center: Sessions, Password, Email, 2FA */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-display font-bold text-slate-900">Security Center</h2>
            <p className="text-sm text-slate-500">Manage your active sessions, authentication credentials, and 2FA.</p>
          </div>
        </div>

        {/* Account Details & Timezone */}
        <div className="py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Account Timezone</h3>
            <p className="text-xs text-slate-500">
              Current schedule timezone: <span className="font-semibold text-slate-700">{userTz}</span> (controls reminder alerts and dose timings)
            </p>
          </div>
          <button
            type="button"
            disabled={tzUpdating}
            onClick={handleSetDeviceTz}
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            {tzUpdating ? 'Updating…' : 'Sync Device Timezone'}
          </button>
        </div>

        {/* Change Password & Email forms */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 pb-6 border-b border-slate-100">
          <form onSubmit={handleChangePassword} className="space-y-3">
            <h3 className="text-sm font-bold text-slate-800">Change Password</h3>
            <input
              type="password"
              placeholder="Current password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              className={inputClass(false)}
            />
            <input
              type="password"
              placeholder="New password (min 8 chars, 1 upper, 1 lower, 1 digit, 1 special)"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className={inputClass(false)}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmNewPw}
              onChange={(e) => setConfirmNewPw(e.target.value)}
              className={inputClass(false)}
            />
            <button
              type="submit"
              disabled={secLoading}
              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
            >
              Update Password
            </button>
          </form>

          <form onSubmit={handleChangeEmail} className="space-y-3">
            <h3 className="text-sm font-bold text-slate-800">Change Email Address</h3>
            <p className="text-xs text-slate-500">Current email: <span className="font-semibold text-slate-700">{user?.email}</span></p>
            <input
              type="email"
              placeholder="New email address"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className={inputClass(false)}
            />
            <input
              type="password"
              placeholder="Your current password"
              value={emailPw}
              onChange={(e) => setEmailPw(e.target.value)}
              className={inputClass(false)}
            />
            <button
              type="submit"
              disabled={secLoading}
              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
            >
              Send Verification Link
            </button>
          </form>
        </div>

        {/* Two-Factor Authentication (TOTP) */}
        <div className="py-6 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Two-Factor Authentication (2FA)</h3>
              <p className="text-xs text-slate-500">Protect your account using standard RFC 6238 authenticator apps (Google Authenticator, Authy, 1Password).</p>
            </div>
            {user?.totp_enabled ? (
              <button
                type="button"
                onClick={() => setShowDisableTotp(true)}
                className="rounded-xl bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 text-xs font-semibold hover:bg-red-100 transition"
              >
                Disable 2FA
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartTotpSetup}
                disabled={secLoading}
                className="rounded-xl bg-teal-700 text-white px-3 py-1.5 text-xs font-semibold hover:bg-teal-800 transition"
              >
                Enable 2FA
              </button>
            )}
          </div>

          {/* TOTP Setup Modal/Card */}
          {totpSetupData && (
            <div className="mt-4 p-4 rounded-xl bg-teal-50/60 border border-teal-200 space-y-3">
              <p className="text-xs font-semibold text-teal-900">Scan this code in your authenticator app or enter the secret manually:</p>
              <div className="bg-white p-2.5 rounded-lg border border-teal-100 inline-block font-mono text-xs select-all text-slate-800">
                Secret: {totpSetupData.secret}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="6-digit code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-36 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-mono tracking-widest text-center"
                />
                <button
                  type="button"
                  onClick={handleConfirmTotp}
                  className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
                >
                  Confirm & Enable
                </button>
                <button
                  type="button"
                  onClick={() => setTotpSetupData(null)}
                  className="text-xs text-slate-500 hover:text-slate-800 px-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Disable TOTP confirmation */}
          {showDisableTotp && (
            <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
              <p className="text-xs font-semibold text-amber-900">Enter your password and current 6-digit code to turn off 2FA:</p>
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  type="password"
                  placeholder="Password"
                  value={disableTotpPw}
                  onChange={(e) => setDisableTotpPw(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                />
                <input
                  type="text"
                  maxLength={6}
                  placeholder="6-digit code"
                  value={disableTotpCode}
                  onChange={(e) => setDisableTotpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-28 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono text-center"
                />
                <button
                  type="button"
                  onClick={handleDisableTotp}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Turn off 2FA
                </button>
                <button
                  type="button"
                  onClick={() => setShowDisableTotp(false)}
                  className="text-xs text-slate-500 px-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Active Sessions */}
        <div className="pt-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Active Devices & Sessions</h3>
              <p className="text-xs text-slate-500">Review devices where your account is currently signed in.</p>
            </div>
            {sessions.length > 1 && (
              <button
                type="button"
                onClick={handleRevokeAllOtherSessions}
                className="text-xs text-red-600 hover:text-red-700 font-semibold underline"
              >
                Sign out of all other devices
              </button>
            )}
          </div>
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                <div>
                  <p className="font-semibold text-slate-800">
                    {s.device_name} {s.is_current && <span className="bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full font-medium ml-1">Current Session</span>}
                  </p>
                  <p className="text-slate-500">IP: {s.ip_address} &bull; Started: {new Date(s.created_at).toLocaleString()}</p>
                </div>
                {!s.is_current && (
                  <button
                    type="button"
                    onClick={() => handleRevokeSession(s.id)}
                    className="text-slate-500 hover:text-red-600 font-medium px-2 py-1 rounded hover:bg-white"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Account Privacy, Data Export & Deletion */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <h2 className="text-lg font-display font-bold text-slate-900 mb-1">Data & Privacy Control</h2>
        <p className="text-sm text-slate-500 mb-6">You have complete ownership of your health records.</p>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50">
            <div>
              <p className="font-semibold text-slate-800 text-sm">Export All Personal Data</p>
              <p className="text-xs text-slate-500">Download a complete export of your profiles and health data across all formats.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExportJson}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                <ArrowDownToLine className="h-4 w-4" aria-hidden="true" /> JSON
              </button>
              <button
                onClick={handleExportZip}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                <ArrowDownToLine className="h-4 w-4" aria-hidden="true" /> ZIP of CSVs
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl border border-red-100 bg-red-50/50">
            <div>
              <p className="font-semibold text-red-900 text-sm">Delete Account & Data</p>
              <p className="text-xs text-red-700">Permanently delete your login, profiles, and all tracking history.</p>
            </div>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 transition"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete Account
            </button>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
              <h3 className="text-lg font-bold text-red-600">Delete Account Permanently</h3>
              <p className="text-xs text-slate-600">
                This action is <span className="font-bold text-red-600">irreversible</span>. All your medical records, family profiles, medication schedules, and audit entries will be permanently erased.
              </p>
              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Enter your password:</label>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    className={inputClass(false)}
                    placeholder="Account password"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Type <span className="font-bold text-red-600">DELETE</span> to confirm:
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    className={inputClass(false)}
                    placeholder="DELETE"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleteConfirmText !== 'DELETE' || !deletePassword}
                  onClick={handleExecuteDeleteAccount}
                  className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition"
                >
                  Permanently Delete Everything
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
