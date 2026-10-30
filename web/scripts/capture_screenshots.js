import { chromium } from '@playwright/test'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const projectRootDir = path.resolve(rootDir, '..')
const outputDir = process.env.SCREENSHOT_DIR || path.resolve(projectRootDir, 'docs', 'screenshots')

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

const mockDashboardData = {
  latest_assessment: {
    id: 1,
    health_score: 88,
    risk_category: 'LOW',
    assessment_date: new Date().toISOString().split('T')[0],
  },
  today_medicines: [
    {
      id: 101,
      medicine_id: 1,
      medicine_name: 'Metformin',
      dosage: '500',
      dosage_unit: 'mg',
      scheduled_time: '08:30:00',
      is_taken: true,
      is_skipped: false,
      dose_instructions: 'Take with morning breakfast',
    },
    {
      id: 102,
      medicine_id: 2,
      medicine_name: 'Lisinopril',
      dosage: '10',
      dosage_unit: 'mg',
      scheduled_time: '20:00:00',
      is_taken: false,
      is_skipped: false,
      dose_instructions: 'Take with evening water',
    },
  ],
  hydration_today: {
    total_intake_ml: 1750,
    daily_goal_ml: 2000,
    percentage: 87.5,
    entries_count: 5,
  },
  exercise_this_week: {
    total_duration_minutes: 135,
    weekly_goal_minutes: 150,
    percentage: 90.0,
    sessions_count: 3,
  },
  sleep_this_week: {
    average_sleep_hours: 7.6,
    goal_sleep_hours: 8.0,
    percentage: 95.0,
    logged_days: 6,
  },
  active_goals: [
    {
      id: 1,
      goal_type: 'EXERCISE',
      goal_description: 'Moderate cardio per week',
      current_value: 135,
      target_value: 150,
      unit: 'minutes/week',
      percentage_complete: 90.0,
      status: 'ACTIVE',
      is_achieved: false,
    },
    {
      id: 2,
      goal_type: 'HYDRATION',
      goal_description: 'Daily water intake',
      current_value: 1750,
      target_value: 2000,
      unit: 'ml/day',
      percentage_complete: 87.5,
      status: 'ACTIVE',
      is_achieved: false,
    },
    {
      id: 3,
      goal_type: 'WEIGHT',
      goal_description: 'Maintain ideal weight',
      current_value: 71.0,
      target_value: 68.0,
      unit: 'kg',
      percentage_complete: 60.0,
      status: 'ACTIVE',
      is_achieved: false,
      progress_note: 'Progress calculated from your starting weight of 75.0 kg toward 68.0 kg.',
    },
  ],
  insights: [
    {
      metric: 'Sleep Quality',
      direction: 'UP',
      message: 'Your average sleep duration is up 35 minutes compared to last week.',
    },
    {
      metric: 'Medication Adherence',
      direction: 'UP',
      message: '100% adherence over the past 7 days — keep up the great consistency!',
    },
  ],
}

async function run() {
  console.log('Starting preview server...')
  const preview = spawn('npx.cmd', ['vite', 'preview', '--port', '4173'], {
    cwd: rootDir,
    stdio: 'pipe',
    shell: true,
  })

  preview.stdout.on('data', (d) => process.stdout.write(d))
  preview.stderr.on('data', (d) => process.stderr.write(d))

  // Wait 3 seconds for preview server
  await new Promise((r) => setTimeout(r, 3000))

  console.log('Launching Chrome...')
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  })

  const viewports = [
    { name: 'dashboard-390px.png', width: 390, height: 844 },
    { name: 'dashboard-768px.png', width: 768, height: 1024 },
    { name: 'dashboard-1280px.png', width: 1280, height: 800 },
  ]

  try {
    for (const vp of viewports) {
      console.log(`Capturing ${vp.name} (${vp.width}x${vp.height})...`)
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
      })
      const page = await context.newPage()

      // Intercept API calls
      await page.route('**/api/auth/me', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 1,
            email: 'sarah@healthpredict.local',
            full_name: 'Sarah Jenkins',
            role: 'USER',
            is_active: true,
            email_verified: true,
          }),
        })
      })

      await page.route('**/api/notifications/unread-count', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ count: 2 }),
        })
      })

      await page.route('**/api/notifications**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        })
      })

      await page.route('**/api/dashboard', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockDashboardData),
        })
      })

      await page.route('**/api/care-profiles/cared-for', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        })
      })

      await page.route('**/api/care-profiles', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 1, full_name: 'Sarah Jenkins', relationship: 'SELF', is_primary: true, is_child: false },
            { id: 2, full_name: 'Tommy Jenkins', relationship: 'CHILD', is_primary: false, is_child: true, date_of_birth: '2016-04-12' },
          ]),
        })
      })

      // Set auth token in localStorage before load
      await page.addInitScript(() => {
        localStorage.setItem('hp_access_token', 'mock_access_token_value')
        localStorage.setItem('hp_refresh_token', 'mock_refresh_token_value')
      })

      await page.goto('http://127.0.0.1:4173/dashboard', { waitUntil: 'networkidle' })

      // Wait a moment for transitions/charts
      await page.waitForTimeout(1000)

      const filePath = path.join(outputDir, vp.name)
      await page.screenshot({ path: filePath, fullPage: true })
      console.log(`Saved screenshot to ${filePath}`)

      // Also copy to brain artifact dir
      const artifactDir = 'C:\\Users\\shrey\\.gemini\\antigravity\\brain\\f526a958-aac1-47db-9d60-e0d457738145\\screenshots'
      if (!fs.existsSync(artifactDir)) {
        fs.mkdirSync(artifactDir, { recursive: true })
      }
      fs.copyFileSync(filePath, path.join(artifactDir, vp.name))

      if (vp.width === 1280) {
        // Open dropdown and switch to Tommy Jenkins (child profile)
        const switcherBtn = page.locator('button:has-text("Sarah Jenkins")').first()
        if (await switcherBtn.isVisible()) {
          await switcherBtn.click()
          await page.waitForTimeout(400)
          const dropdownPath = path.join(outputDir, 'profile-switcher-dropdown.png')
          await page.screenshot({ path: dropdownPath })
          fs.copyFileSync(dropdownPath, path.join(artifactDir, 'profile-switcher-dropdown.png'))

          const childOption = page.locator('button:has-text("Tommy Jenkins")').first()
          if (await childOption.isVisible()) {
            await childOption.click()
            await page.waitForTimeout(600)
            const childDashPath = path.join(outputDir, 'dashboard-child-profile-1280px.png')
            await page.screenshot({ path: childDashPath, fullPage: true })
            fs.copyFileSync(childDashPath, path.join(artifactDir, 'dashboard-child-profile-1280px.png'))
            console.log('Captured child profile view with pediatric banner!')
          }
        }
      }

      // Also capture Notifications view at this viewport
      await page.route('**/api/notifications/streaks', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            current_streak_days: 7,
            longest_streak_days: 14,
            total_active_days: 28,
            is_streak_active_today: true,
            badges: [
              { id: 'streak_3', name: 'Getting Started', days_required: 3, unlocked: true, icon: 'zap', description: '3-day streak' },
              { id: 'streak_7', name: 'Week Strong', days_required: 7, unlocked: true, icon: 'award', description: '7-day streak' },
            ],
            next_milestone: 14,
          }),
        })
      })

      await page.route('**/api/notifications/preferences', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            quiet_hours_start: '22:00',
            quiet_hours_end: '08:00',
            reminder_lead_time_minutes: 15,
          }),
        })
      })

      await page.route('**/api/notifications?**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 1,
                notification_type: 'MEDICINE_REMINDER',
                title: 'Medication Reminder: Lisinopril',
                message: 'Scheduled for 08:30: 10 mg • Take with morning water',
                is_read: false,
                sent_at: new Date().toISOString(),
                related_entity_type: 'medicine_schedule',
                related_entity_id: 102,
                created_at: new Date(Date.now() - 10 * 60000).toISOString(),
              },
              {
                id: 2,
                notification_type: 'REFILL_ALERT',
                title: 'Refill Alert: Metformin',
                message: 'Your supply of Metformin is running low (3 pills remaining). Please contact your pharmacy for a refill.',
                is_read: false,
                sent_at: new Date().toISOString(),
                related_entity_type: 'medicine_refill',
                related_entity_id: 1,
                created_at: new Date(Date.now() - 45 * 60000).toISOString(),
              },
              {
                id: 3,
                notification_type: 'APPOINTMENT_REMINDER',
                title: 'Appointment Tomorrow: Dr. Sarah Jenkins',
                message: 'Reminder: You have an appointment with Dr. Sarah Jenkins (Cardiology) tomorrow at 10:00.',
                is_read: true,
                sent_at: new Date().toISOString(),
                related_entity_type: 'appointment_reminder_24h',
                related_entity_id: 5,
                created_at: new Date(Date.now() - 120 * 60000).toISOString(),
              },
            ],
            total: 3,
            unread: 2,
            page: 1,
            page_size: 20,
          }),
        })
      })

      await page.goto('http://127.0.0.1:4173/notifications', { waitUntil: 'networkidle' })
      await page.waitForTimeout(600)
      const notifName = `notifications-${vp.width}px.png`
      const notifPath = path.join(outputDir, notifName)
      await page.screenshot({ path: notifPath, fullPage: true })
      fs.copyFileSync(notifPath, path.join(artifactDir, notifName))
      console.log(`Captured ${notifName} with streaks, snooze buttons, and preferences!`)

      // --- Group 8: Emergency Medical ID Card & Vector QR Code ---
      await page.route('**/api/health/emergency-card', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 1,
              user_id: 1,
              public_token: 'emergency_token_demo_123',
              blood_type: 'O+',
              allergies: ['Penicillin', 'Peanuts', 'Latex'],
              chronic_conditions: ['Hypertension', 'Mild Asthma'],
              current_medications: ['Lisinopril 10mg', 'Albuterol Inhaler'],
              emergency_contact_name: 'Jane Chase',
              emergency_contact_phone: '+1 (555) 019-2834',
              emergency_contact_relationship: 'Spouse',
              organ_donor: true,
              medical_notes: 'Penicillin causes hives. Keep inhaler within reach.',
              is_public: true,
              updated_at: new Date().toISOString(),
            }),
          })
        } else {
          await route.continue()
        }
      })

      await page.route('**/api/health/emergency-card/qr', async (route) => {
        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140" viewBox="0 0 140 140">
          <rect width="140" height="140" fill="#ffffff"/>
          <rect x="10" y="10" width="40" height="40" fill="#0f766e"/>
          <rect x="20" y="20" width="20" height="20" fill="#ffffff"/>
          <rect x="90" y="10" width="40" height="40" fill="#0f766e"/>
          <rect x="100" y="20" width="20" height="20" fill="#ffffff"/>
          <rect x="10" y="90" width="40" height="40" fill="#0f766e"/>
          <rect x="20" y="100" width="20" height="20" fill="#ffffff"/>
          <rect x="60" y="60" width="20" height="20" fill="#e11d48"/>
          <rect x="60" y="20" width="15" height="15" fill="#0f766e"/>
          <rect x="20" y="60" width="15" height="15" fill="#0f766e"/>
          <rect x="90" y="60" width="25" height="15" fill="#0f766e"/>
          <rect x="60" y="90" width="20" height="30" fill="#0f766e"/>
          <rect x="95" y="95" width="25" height="25" fill="#0f766e"/>
        </svg>`
        await route.fulfill({
          status: 200,
          contentType: 'image/svg+xml',
          body: svgContent,
        })
      })

      await page.goto('http://127.0.0.1:4173/emergency-card', { waitUntil: 'networkidle' })
      await page.waitForTimeout(600)
      const emergName = `emergency-card-${vp.width}px.png`
      const emergPath = path.join(outputDir, emergName)
      await page.screenshot({ path: emergPath, fullPage: true })
      fs.copyFileSync(emergPath, path.join(artifactDir, emergName))
      console.log(`Captured ${emergName} with vector SVG QR code and wallet card layout!`)

      // --- Group 9: Goals & Wellness Correlations ---
      await page.route('**/api/goals/recommendations', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            recommendations: [
              {
                goal_type: 'EXERCISE',
                goal_description: 'Achieve WHO Aerobic Target (150 min/wk)',
                target_value: 150,
                unit: 'minutes/week',
                rationale: 'You are currently at 135 mins/wk. Progressively bridging to 150 mins provides optimal cardiometabolic protection.',
                category: 'activity',
                difficulty: 'moderate',
              },
              {
                goal_type: 'SLEEP',
                goal_description: 'Restore Optimal Recovery Sleep (7.5 hrs/night)',
                target_value: 7.5,
                unit: 'hours/night',
                rationale: 'Consistent 7-8 hours of sleep stabilizes blood pressure and lowers cortisol.',
                category: 'recovery',
                difficulty: 'starter',
              },
              {
                goal_type: 'MEDICINE_ADHERENCE',
                goal_description: 'Perfect Medication Adherence (95%+)',
                target_value: 95,
                unit: '% adherence',
                rationale: 'You currently have 2 active prescription(s). Achieving >=95% adherence ensures consistent therapeutic efficacy.',
                category: 'adherence',
                difficulty: 'moderate',
              },
            ],
            user_context: {
              current_weekly_exercise_mins: 135,
              current_avg_sleep_hours: 7.6,
              active_medications_count: 2,
              risk_level: 'LOW',
              risk_score: 88.0,
            },
          }),
        })
      })

      await page.route('**/api/goals', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 1,
              goal_type: 'EXERCISE',
              goal_description: 'Weekly Cardio Movement',
              target_value: 150,
              current_value: 135,
              percentage_complete: 90.0,
              unit: 'minutes/week',
              is_achieved: false,
              status: 'ACTIVE',
              start_date: new Date().toISOString().split('T')[0],
            },
            {
              id: 2,
              goal_type: 'SLEEP',
              goal_description: 'Nightly Sleep Duration',
              target_value: 8.0,
              current_value: 7.6,
              percentage_complete: 95.0,
              unit: 'hours/night',
              is_achieved: false,
              status: 'ACTIVE',
              start_date: new Date().toISOString().split('T')[0],
            },
          ]),
        })
      })

      await page.goto('http://127.0.0.1:4173/goals', { waitUntil: 'networkidle' })
      await page.waitForTimeout(600)
      const goalsName = `goals-${vp.width}px.png`
      const goalsPath = path.join(outputDir, goalsName)
      await page.screenshot({ path: goalsPath, fullPage: true })
      fs.copyFileSync(goalsPath, path.join(artifactDir, goalsName))
      console.log(`Captured ${goalsName} with 1-click recommended goals!`)

      await context.close()
    }
  } finally {
    await browser.close()
    preview.kill()
  }

  console.log('Done capturing screenshots!')
}

run().catch((err) => {
  console.error('Error capturing screenshots:', err)
  process.exit(1)
})
