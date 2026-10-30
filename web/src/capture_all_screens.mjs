import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.resolve(__dirname, '../../docs/screenshots');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const mockUser = {
  id: 1,
  email: 'alex.river@example.com',
  full_name: 'Alex River',
  role: 'USER',
  is_active: true,
};

const mockSymptoms = [
  {
    id: 1,
    symptom_name: 'Mild Headache',
    severity: 2,
    notes: 'After long computer session, improved with hydration',
    logged_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
  },
  {
    id: 2,
    symptom_name: 'Fatigue & Lethargy',
    severity: 3,
    notes: 'Felt tired in the afternoon',
    logged_at: new Date(Date.now() - 3600000 * 28).toISOString(),
    created_at: new Date(Date.now() - 3600000 * 28).toISOString(),
  },
  {
    id: 3,
    symptom_name: 'Knee Joint Stiffness',
    severity: 1,
    notes: 'Morning walk stiffness, resolved in 10 mins',
    logged_at: new Date(Date.now() - 3600000 * 52).toISOString(),
    created_at: new Date(Date.now() - 3600000 * 52).toISOString(),
  },
];

const mockAppointments = [
  {
    id: 1,
    doctor_name: 'Dr. Evelyn Reed',
    specialty: 'Cardiologist',
    location: 'Metropolitan Heart Center, Suite 410',
    appointment_date: new Date(Date.now() + 86400000 * 4).toISOString(),
    reason_for_visit: 'Routine 6-month blood pressure review',
    questions_to_ask: ['Should I adjust my Lisinopril dose?', 'Is morning cardio better for heart rate?'],
    status: 'UPCOMING',
    created_at: new Date().toISOString(),
  },
  {
    id: 2,
    doctor_name: 'Dr. Marcus Vance',
    specialty: 'Primary Care Physician',
    location: 'Family Health Clinic, Room 12',
    appointment_date: new Date(Date.now() - 86400000 * 21).toISOString(),
    reason_for_visit: 'Annual wellness checkup and blood panel',
    questions_to_ask: [],
    status: 'COMPLETED',
    created_at: new Date().toISOString(),
  },
];

const mockEmergencyCard = {
  id: 1,
  user_id: 1,
  public_token: 'demo-public-emergency-token-xyz99',
  blood_type: 'O+',
  allergies: ['Penicillin', 'Peanuts', 'Sulfa drugs'],
  chronic_conditions: ['Hypertension', 'Mild Seasonal Asthma'],
  current_medications: ['Lisinopril 10mg daily', 'Albuterol Inhaler PRN'],
  emergency_contact_name: 'Sarah River',
  emergency_contact_phone: '+1 (555) 234-5678',
  emergency_contact_relationship: 'Spouse',
  organ_donor: true,
  medical_notes: 'Allergic to penicillin (hives and swelling). Wears medic alert bracelet.',
  is_public: true,
  updated_at: new Date().toISOString(),
};

async function setupPageInterceptors(page) {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) });
  });

  await page.route('**/api/health/symptoms*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockSymptoms) });
  });

  await page.route('**/api/health/appointments*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAppointments) });
  });

  await page.route('**/api/health/emergency-card/public/*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockEmergencyCard) });
  });

  await page.route('**/api/health/emergency-card', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockEmergencyCard) });
  });

  await page.route('**/api/dashboard/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        health_score: { score: 85, category: 'Good', trend: '+3' },
        up_next_medication: { name: 'Lisinopril', dosage: '10mg', scheduled_time: '08:00 AM' },
        adherence_percentage: 92,
        hydration_ml: 1750,
        hydration_goal_ml: 2500,
        sleep_hours: 7.5,
        sleep_goal_hours: 8,
        exercise_minutes: 35,
        exercise_goal_minutes: 45,
      }),
    });
  });

  await page.route('**/api/notifications*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], unread_count: 0 }),
    });
  });
}

async function run() {
  console.log('Launching browser with Edge...');
  const browser = await chromium.launch({
    executablePath: edgePath,
    headless: true,
  });

  const baseUrl = 'http://localhost:5173';

  const viewports = [
    { name: 'mobile-390', width: 390, height: 844 },
    { name: 'desktop-1280', width: 1280, height: 800 },
  ];

  for (const vp of viewports) {
    console.log(`Capturing responsive views for: ${vp.name}...`);
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
    });

    await setupPageInterceptors(page);

    try {
      // Set localStorage mock tokens
      await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => {
        localStorage.setItem('hp_access_token', 'mock_token_abc123');
        localStorage.setItem('hp_refresh_token', 'mock_refresh_abc123');
      });

      // 1. Symptom Diary
      await page.goto(`${baseUrl}/symptoms`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(outDir, `symptoms-${vp.name}.png`), fullPage: false });

      // 2. Appointments
      await page.goto(`${baseUrl}/appointments`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(outDir, `appointments-${vp.name}.png`), fullPage: false });

      // 3. Emergency Card (Protected edit view)
      await page.goto(`${baseUrl}/emergency-card`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(outDir, `emergency-card-${vp.name}.png`), fullPage: false });

      // 4. Public Emergency Card (Public view)
      if (vp.name === 'mobile-390') {
        await page.goto(`${baseUrl}/e/demo-public-emergency-token-xyz99`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(outDir, `public-emergency-card-mobile-390.png`), fullPage: false });
      }
    } catch (err) {
      console.error(`Error on viewport ${vp.name}:`, err.message);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log('Finished capturing all new screenshots!');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
