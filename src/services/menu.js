/**
 * Time-aware menu resolver for the voice server.
 *
 * At call time we resolve which menu is currently active for the business
 * (based on day-of-week and wall-clock time in the business timezone), load
 * its services, and attach any active specials.  If no menu system is
 * configured we fall back to loading all available services.
 */

import { query } from '../db/pool.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const DOW_ISO = {
  Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4,
  Friday: 5, Saturday: 6, Sunday: 7,
};

/**
 * Returns { dow: number, timeStr: 'HH:MM:SS' } in the given IANA timezone.
 */
function localTimeParts(timezone) {
  const now = new Date();
  const fmt = (opts) =>
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, ...opts }).format(now);

  const dow     = DOW_ISO[fmt({ weekday: 'long' })] ?? 1;
  const hh      = fmt({ hour: '2-digit',  hour12: false }).padStart(2, '0');
  const mm      = fmt({ minute: '2-digit' }).padStart(2, '0');
  const ss      = fmt({ second: '2-digit' }).padStart(2, '0');
  const timeStr = `${hh}:${mm}:${ss}`;

  return { dow, timeStr };
}

// ── Core resolver ─────────────────────────────────────────────────────────────

/**
 * getActiveMenuData(businessId, timezone?)
 *
 * Returns:
 *   {
 *     menu:     object | null,   // the active menu row (or null if none configured)
 *     services: object[],         // menu items active right now
 *     specials: object[],         // time-limited specials active right now
 *   }
 *
 * Resolution order:
 *   1. A menu whose schedule covers the current dow + time
 *   2. The menu flagged is_default = true
 *   3. null (fall through → load all available services)
 */
export async function getActiveMenuData(businessId, timezone = 'America/Chicago') {
  let tz = timezone;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { tz = 'UTC'; }
  const { dow, timeStr } = localTimeParts(tz);

  // 1. Scheduled match
  const scheduled = await query(
    `SELECT m.*
       FROM menus m
       JOIN menu_schedules ms ON ms.menu_id = m.id
      WHERE m.business_id = $1
        AND ms.is_active   = true
        AND $2 = ANY(ms.days_of_week)
        AND $3::time >= ms.start_time
        AND $3::time <  ms.end_time
      ORDER BY ms.created_at
      LIMIT 1`,
    [businessId, dow, timeStr]
  );

  let menu = scheduled.rows[0] ?? null;

  // 2. Default fallback
  if (!menu) {
    const def = await query(
      `SELECT * FROM menus WHERE business_id = $1 AND is_default = true LIMIT 1`,
      [businessId]
    );
    menu = def.rows[0] ?? null;
  }

  // 3. Load services for the resolved menu
  //    Items with menu_id = active menu  OR  unassigned items (menu_id IS NULL)
  //    If no menu at all, load everything available.
  let services;
  if (menu) {
    const svcResult = await query(
      `SELECT s.*, sc.name AS category_name
         FROM services s
         LEFT JOIN service_categories sc ON sc.id = s.category_id
        WHERE s.business_id = $1
          AND s.is_available = true
          AND (s.menu_id = $2 OR s.menu_id IS NULL)
        ORDER BY sc.display_order, s.name`,
      [businessId, menu.id]
    );
    services = svcResult.rows;
  } else {
    const svcResult = await query(
      `SELECT s.*, sc.name AS category_name
         FROM services s
         LEFT JOIN service_categories sc ON sc.id = s.category_id
        WHERE s.business_id = $1
          AND s.is_available = true
        ORDER BY sc.display_order, s.name`,
      [businessId]
    );
    services = svcResult.rows;
  }

  // 4. Active specials — time and date aware
  const specialsResult = await query(
    `SELECT * FROM menu_specials
      WHERE business_id   = $1
        AND is_active      = true
        AND (available_from  IS NULL OR available_from  <= now())
        AND (available_until IS NULL OR available_until >  now())
        AND (days_of_week IS NULL OR $2 = ANY(days_of_week))
        AND (start_time IS NULL OR $3::time >= start_time)
        AND (end_time   IS NULL OR $3::time <  end_time)
      ORDER BY created_at`,
    [businessId, dow, timeStr]
  );

  return { menu, services, specials: specialsResult.rows };
}
