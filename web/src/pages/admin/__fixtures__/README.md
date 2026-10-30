# Recorded API responses

These JSON files are **real responses** captured from a running backend (MariaDB, the trained model, real users, real
ML predictions and real admin actions) by an end-to-end script. They exist so `adminContract.test.jsx` can check the admin
pages against the real API shape. The users are fictional (`@e2e.example.com`).

If the admin API changes, re-record them (start the backend with `RATE_LIMIT_ENABLED=false`, run a scenario that creates
users, assessments with predictions, and a deactivate/reactivate, then save each `/admin/...` response here) and re-run
`npm test`.
