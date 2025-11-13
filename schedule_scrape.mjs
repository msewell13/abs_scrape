// scrape_month_block_with_login.mjs — login → Month tab → Month Block View → scrape shift cards w/ solid date + payer
import { writeFile } from 'fs/promises';
import auth from './auth.mjs';

const SCHEDULE_URL = process.env.ABS_SCHEDULE_URL || 'https://abs.brightstarcare.com/schedule/schedulemaster.aspx';

const MONTH_TAB_TEXT = /month/i;
const BLOCK_BTN = '#ctl00_MC_SC1_imageButtonBlock';
const CARD_SELECTORS = [
  '.shift-box-new',
  '.shiftBox',
  '[data-tooltip]',
  '.k-scheduler .k-event',
  '.fc-event'
];

const norm = (t) => (t ?? '').replace(/\s+/g, ' ').trim();

// No interactive prompts; rely on .env


async function debugDump(page, label) {
  try {
    await writeFile(`DEBUG-${label}.html`, await page.content());
    await writeFile(`DEBUG-${label}.png`, await page.screenshot({ fullPage: true }));
  } catch {}
}

function rowsToCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n');
}

/** ===== Month/Year helpers ===== */
async function getVisibleMonthYear(page) {
  const selectors = [
    '#ctl00_MC_SC1_labelMonthHeader',
    '#ctl00_MC_SC1_labelDateRange',
    '.k-nav-fast',                 // Kendo fast-nav (e.g., "September 2025")
    '.fc-toolbar-title',           // FullCalendar title
    '.calendarTitle', '.monthLabel'
  ];
  for (const sel of selectors) {
    try {
      const txt = await page.locator(sel).first().textContent();
      const s = norm(txt);
      if (s && /[A-Za-z]+/.test(s) && /\d{4}/.test(s)) return s;
    } catch {}
  }
  return null;
}

function parseMonthYear(text) {
  if (!text) return null;
  const m = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)[a-z]*\s+(?:\d{1,2}\s*[-–]\s*\d{1,2},\s*)?(\d{4})/i);
  if (!m) return null;
  const name = m[1].toLowerCase();
  const year = Number(m[2]);
  const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  const idx = months.findIndex(full => full.startsWith(name.slice(0,3)));
  if (idx < 0) return null;
  return { monthIndex: idx, year };
}

/** ===== Date inference from card =====
 *  - Look for nearest ancestor that looks like a "day cell"
 *  - Use data-date / aria-label / title when present
 *  - Else read a day number then compose YYYY-MM-DD with header month/year
 *  - Adjust if cell is marked "other-month" (prev/next)
 */
async function inferDateFromCard(page, cardHandle, monthYearHint) {
  const info = await cardHandle.evaluate((node) => {
    const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
    const isOtherMonthClass = (cls) => /k-other-month|fc-day-other|otherMonth|rsOtherMonth/i.test(cls || '');

    // Try to find a day cell ancestor with known patterns
    let p = node;
    for (let i = 0; i < 10 && p; i++) {
      if (p.getAttribute) {
        const dd = p.getAttribute('data-date');               // e.g. "2025-09-20"
        const aria = p.getAttribute('aria-label');            // e.g. "September 20, 2025"
        const title = p.getAttribute('title');                // sometimes contains full date
        if (dd) return { kind: 'attr-date', val: clean(dd), other: isOtherMonthClass(p.className) };
        if (aria && /[A-Za-z]+\s+\d{1,2},\s*\d{4}/.test(aria)) return { kind: 'attr-aria', val: clean(aria), other: isOtherMonthClass(p.className) };
        if (title && /[A-Za-z]+\s+\d{1,2},\s*\d{4}/.test(title)) return { kind: 'attr-title', val: clean(title), other: isOtherMonthClass(p.className) };
      }
      if (p.querySelector) {
        // Common day-number labels across libraries
        const dn = p.querySelector('.fc-daygrid-day-number, .k-scheduler-date, .rsDateHeader, .rsDateBox, .day-number, .dayLabel, .date');
        if (dn) {
          const raw = clean(dn.textContent || '');
          // Some libs put the full date in href/title
          const href = dn.getAttribute?.('href');
          const t = dn.getAttribute?.('title');
          return { kind: 'day-number', val: raw, href: href || null, title: t || null, other: /k-other-month|fc-day-other|otherMonth|rsOtherMonth/i.test(p.className || '') };
        }
      }
      p = p.parentElement;
    }
    // Fallback: look for closest gridcell (ARIA) and try attributes there
    p = node;
    for (let i = 0; i < 10 && p; i++) {
      if (p.matches?.('td[role="gridcell"], div[role="gridcell"]')) {
        const dd = p.getAttribute('data-date');
        const aria = p.getAttribute('aria-label');
        if (dd || aria) return { kind: dd ? 'attr-date' : 'attr-aria', val: clean(dd || aria), other: /other/i.test(p.className || '') };
      }
      p = p.parentElement;
    }
    return null;
  });

  if (!info) return null;

  // Direct date forms
  if (info.kind === 'attr-date') {
    // Expect YYYY-MM-DD or ISO
    const m = info.val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const d = new Date(info.val);
    if (!isNaN(d)) return d.toISOString().slice(0,10);
  }
  if (info.kind === 'attr-aria' || info.kind === 'attr-title') {
    const d = new Date(info.val);
    if (!isNaN(d)) return d.toISOString().slice(0,10);
  }
  if (info.kind === 'day-number') {
    // If title/href contains a full date, prefer that
    if (info.title && /[A-Za-z]+\s+\d{1,2},\s*\d{4}/.test(info.title)) {
      const d = new Date(info.title);
      if (!isNaN(d)) return d.toISOString().slice(0,10);
    }
    if (info.href && /date|day/i.test(info.href)) {
      const d = new Date(info.href);
      if (!isNaN(d)) return d.toISOString().slice(0,10);
    }

    // Otherwise compose from visible month/year + numeric day, with other-month adjustment
    if (monthYearHint) {
      let mIdx = monthYearHint.monthIndex;
      let year = monthYearHint.year;

      if (info.other === true) {
        // Determine if the day number likely belongs to prev or next month.
        // Heuristic: in a month grid, leading "other" days are small numbers (1..7) -> previous month;
        // trailing "other" days are small numbers too, but appear after day ~24 -> treat as next month.
        const dayNum = parseInt(String(info.val).replace(/[^\d]/g, ''), 10);
        if (!isNaN(dayNum)) {
          // If day number is small and we're at the start of the grid, it's previous month
          // Without layout context, assume small numbers in "other" go to prev month
          // and large numbers in "other" go to next month.
          if (dayNum <= 7) {
            mIdx = (mIdx + 11) % 12;
            if (mIdx === 11) year -= 1; // rolled back to December
          } else if (dayNum >= 25) {
            mIdx = (mIdx + 1) % 12;
            if (mIdx === 0) year += 1;  // rolled forward to January
          }
        }
      }

      const dayNum = parseInt(String(info.val).replace(/[^\d]/g, ''), 10);
      if (!isNaN(dayNum)) {
        const d = new Date(year, mIdx, dayNum);
        return d.toISOString().slice(0,10);
      }
    }
  }

  return null;
}

/** ===== scraping helpers for block cards ===== */
async function pickText(el, sel) {
  const n = await el.$(sel);
  return n ? norm(await n.textContent()) : null;
}

async function extractCard(el, page, monthYearHint) {
  const norm = (t) => (t ?? '').replace(/\s+/g, ' ').trim();

  // tiny helpers
  const pickText = async (handle, sel) => {
    const n = await handle.$(sel);
    return n ? norm(await n.textContent()) : null;
  };
  const usToIso = (mdy) => {
    // accepts "9/1/2025" or "09/01/2025"
    const m = String(mdy).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const [_, mm, dd, yyyy] = m;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  };

  // ---- fields already working for you ----
  const time = await pickText(el, '.timeelement, .time, .shift-time');
  let client = await pickText(el, '.customerTag a, .customerTag, .client a, .client');
  let employee = await pickText(el, '.employeeTag a, .employeeTag, .employee a, .employee');
  const product = await pickText(el, '.productTag a, .productTag');
  const bill_rate = await pickText(el, '.bill-rate, .billRate');
  const pay_rate = await pickText(el, '.pay-rate, .payRate');

  // Clean up prefixes
  if (client && client.startsWith('C:')) client = client.substring(2).trim();
  if (employee && employee.startsWith('E:')) employee = employee.substring(2).trim();

  // Extract status based on color coding
  let status = null;
  try {
    const statusInfo = await el.evaluate((node) => {
      // Check for common status indicators
      const computedStyle = window.getComputedStyle(node);
      const backgroundColor = computedStyle.backgroundColor;
      const borderColor = computedStyle.borderColor;
      const color = computedStyle.color;
      
      // Check for red indicators (Open status)
      const isRed = backgroundColor.includes('rgb(255, 0, 0)') || 
                   backgroundColor.includes('rgb(220, 53, 69)') ||
                   backgroundColor.includes('rgb(163, 0, 19)') ||
                   backgroundColor.includes('#dc3545') ||
                   backgroundColor.includes('#ff0000') ||
                   backgroundColor.includes('#a30013') ||
                   borderColor.includes('rgb(255, 0, 0)') ||
                   borderColor.includes('rgb(220, 53, 69)') ||
                   borderColor.includes('rgb(163, 0, 19)') ||
                   borderColor.includes('#dc3545') ||
                   borderColor.includes('#ff0000') ||
                   borderColor.includes('#a30013') ||
                   color.includes('rgb(255, 0, 0)') ||
                   color.includes('rgb(220, 53, 69)') ||
                   color.includes('rgb(163, 0, 19)') ||
                   color.includes('#dc3545') ||
                   color.includes('#ff0000') ||
                   color.includes('#a30013');
      
      // Check for green indicators (Assigned status)
      const isGreen = backgroundColor.includes('rgb(0, 128, 0)') ||
                     backgroundColor.includes('rgb(40, 167, 69)') ||
                     backgroundColor.includes('#28a745') ||
                     backgroundColor.includes('#008000') ||
                     borderColor.includes('rgb(0, 128, 0)') ||
                     borderColor.includes('rgb(40, 167, 69)') ||
                     borderColor.includes('#28a745') ||
                     borderColor.includes('#008000') ||
                     color.includes('rgb(0, 128, 0)') ||
                     color.includes('rgb(40, 167, 69)') ||
                     color.includes('#28a745') ||
                     color.includes('#008000');
      
      // Check for completed indicators (blue, gray, or other neutral colors)
      const isCompleted = backgroundColor.includes('rgb(0, 0, 255)') ||
                         backgroundColor.includes('rgb(70, 130, 180)') ||
                         backgroundColor.includes('rgb(128, 128, 128)') ||
                         backgroundColor.includes('rgb(169, 169, 169)') ||
                         backgroundColor.includes('#0000ff') ||
                         backgroundColor.includes('#4682b4') ||
                         backgroundColor.includes('#808080') ||
                         backgroundColor.includes('#a9a9a9') ||
                         borderColor.includes('rgb(0, 0, 255)') ||
                         borderColor.includes('rgb(70, 130, 180)') ||
                         borderColor.includes('rgb(128, 128, 128)') ||
                         borderColor.includes('rgb(169, 169, 169)') ||
                         borderColor.includes('#0000ff') ||
                         borderColor.includes('#4682b4') ||
                         borderColor.includes('#808080') ||
                         borderColor.includes('#a9a9a9');
      
      // Check for CSS classes that might indicate status
      const classList = Array.from(node.classList);
      const hasOpenClass = classList.some(cls => 
        /open|unassigned|available|pending/i.test(cls)
      );
      const hasAssignedClass = classList.some(cls => 
        /assigned|filled|confirmed|scheduled/i.test(cls)
      );
      const hasCompletedClass = classList.some(cls => 
        /completed|finished|done/i.test(cls)
      );
      
      return {
        isRed,
        isGreen,
        isCompleted,
        hasOpenClass,
        hasAssignedClass,
        hasCompletedClass,
        backgroundColor,
        borderColor,
        color,
        classList: classList.join(' ')
      };
    });
    
    if (statusInfo.isRed || statusInfo.hasOpenClass) {
      status = 'Open';
    } else if (statusInfo.isGreen || statusInfo.hasAssignedClass) {
      status = 'Assigned';
    } else if (statusInfo.isCompleted || statusInfo.hasCompletedClass) {
      status = 'Completed';
    }
    
  } catch (error) {
    // If status detection fails, continue without it
    console.log('Status detection failed for one card:', error.message);
  }

  // location via bold "L:"
  let location = null;
  for (const b of await el.$$('b')) {
    const t = norm(await b.textContent());
    if (/^L:\s*/i.test(t)) {
      const parent = await b.evaluateHandle(x => x.parentElement);
      const text = norm(await parent.evaluate(x => x.textContent || ''));
      location = text.replace(/^.*L:\s*/i, '');
      break;
    }
  }

  // parse start/end from "9:00 AM - 5:00 PM"
  let start_time = null, end_time = null;
  if (time) {
    const m =
      time.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*[-–]\s*(\d{1,2}:\d{2}\s*[AP]M)/i) ||
      time.match(/(\d{1,2}\s*[AP]M)\s*[-–]\s*(\d{1,2}\s*[AP]M)/i);
    if (m) { start_time = m[1]; end_time = m[2]; }
  }

  // ===== DATE (primary: data-tooltip; fallback: <td> .boldFont like "Sep 1") =====
  let date = null;

  // A) Try the pencil icon's data-tooltip (most reliable and per-card)
  try {
    const pencil = await el.$('img[id^="tip_"][data-tooltip]');
    if (pencil) {
      const tooltip = await pencil.getAttribute('data-tooltip');
      // find a |MM/DD/YYYY| token
      const mdy = (tooltip.match(/\|(\d{1,2}\/\d{1,2}\/\d{4})\|/) || [])[1];
      if (mdy) date = usToIso(mdy);
      // (optional) also try ISO if present in tooltip
      if (!date) {
        const iso = (tooltip.match(/\b(\d{4}-\d{2}-\d{2})\b/) || [])[1];
        if (iso) date = iso;
      }
    }
  } catch {}

  // B) Fallback: climb to TD and read ".boldFont" (e.g., "Sep 1") + monthYearHint
  if (!date) {
    try {
      const td = await el.evaluateHandle(node => {
        let p = node.parentElement;
        for (let i = 0; i < 12 && p; i++) { if (p.tagName === 'TD') return p; p = p.parentElement; }
        return null;
      });
      if (td) {
        const rawDay = await td.evaluate(cell => {
          const s = cell.querySelector('.boldFont');
          return s ? (s.textContent || '').trim() : null;
        });

        if (rawDay && monthYearHint) {
          // rawDay like "Sep 1" or "September 1"
          const dayNum = parseInt(rawDay.replace(/[^\d]/g, ''), 10);
          if (!isNaN(dayNum)) {
            const d = new Date(monthYearHint.year, monthYearHint.monthIndex, dayNum);
            date = d.toISOString().slice(0, 10);
          }
        }
      }
    } catch {}
  }

  return { date, time, start_time, end_time, client, employee, location, product, bill_rate, pay_rate, status };
}


async function waitForAnySelector(page, selectors, timeout = 25000) {
  const start = Date.now();
  for (const sel of selectors) {
    const left = Math.max(1500, timeout - (Date.now() - start));
    try {
      await page.waitForSelector(sel, { timeout: left });
      return sel;
    } catch {}
  }
  throw new Error(`No shift cards appeared for selectors: ${selectors.join(', ')}`);
}


async function switchToMonth(page) {
  const tabByRole = page.getByRole('tab', { name: MONTH_TAB_TEXT }).first();
  if (await tabByRole.count()) {
    await tabByRole.click();
  } else {
    const tabByText = page.locator('#ctl00_MC_SC1_tabSC .rtsTxt', { hasText: MONTH_TAB_TEXT }).first();
    await tabByText.click();
  }
  await page.waitForTimeout(600);
}

(async () => {
  // Get authenticated browser, context, and page
  const { browser, page } = await auth.getAuthenticatedBrowser();

  // 2) go to Schedule Master
  await page.goto(SCHEDULE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // 3) Month tab
  await switchToMonth(page);

  // 4) Month Block View
  await page.click(BLOCK_BTN).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(400);

  // 5) wait for cards
  const usedSelector = await waitForAnySelector(page, CARD_SELECTORS, 30000);
  console.log(`Detected shift cards using selector: ${usedSelector}`);

  // 6) capture month/year hint for date inference
  const monthYearText = await getVisibleMonthYear(page);
  const monthYearHint = parseMonthYear(monthYearText);

  // 7) scrape all cards
  const cardHandles = await page.$$(usedSelector);
  if (!cardHandles.length) {
    await debugDump(page, 'NO-CARDS');
    throw new Error('No shift cards found after switching to Month Block View.');
  }

  const results = [];
  for (const el of cardHandles) {
    results.push(await extractCard(el, page, monthYearHint));
  }

  const missingDate = results.filter(r => !r.date).length;
  console.log(`Quality: ${missingDate} records missing date.`);

  // Save data to local files (overwrites existing files)
  await writeFile('month_block.json', JSON.stringify(results, null, 2));
  await writeFile('month_block.csv', rowsToCsv(results), 'utf8');
  console.log(`✅ Wrote ${results.length} records to month_block.json and month_block.csv`);

  await browser.close();
})().catch(async (err) => {
  console.error('ERROR:', err.message);
  process.exitCode = 1;
});
