"use strict";

/* SAINTS & PISTONS — editable booking shell
 * Open index.html with styles.css and script.js in the same folder.
 * This draft deliberately DOES NOT submit, save, or reserve appointments.
 * No customer details are stored in browser storage or sent to Google.
 *
 * LIVE CALENDAR NEXT STEP
 * The sharing link identifies a calendar; it does not grant API write access.
 * Use a server / Google Apps Script with authorized access to this calendar.
 * Keep credentials on the server, never in this file.
 * For two bookings per day, return remaining capacity from actual booking
 * records/events. Google freeBusy alone cannot count two daily booking places.
 * Define shop timezone, school closures and appointment hours before launch.
 * On submission the server must validate all fields, lock/recheck capacity,
 * create the booking/event, and return confirmation. Prevent duplicate requests.
 * Do not replace the preview message with confirmation until this is connected.
 * Calendar API: https://developers.google.com/workspace/calendar/api/v3/reference
 */
const CONFIG = Object.freeze({
  spotsPerDay: 2,
  bookingHorizonDays: 90,
  // Starting assumption: Eastern Time. Confirm the school's timezone.
  timeZone: "America/New_York",
  closedDates: [], // Future format: ["2026-12-25", ...]. School holidays are not yet configured.
  calendarId: "c_ba5995712913b551ae07c4eac53c2c9153cee76fa02c28279c2c8a999e430fa0@group.calendar.google.com",
  calendarShareUrl: "https://calendar.google.com/calendar/u/0?cid=Y19iYTU5OTU3MTI5MTNiNTUxYWUwN2M0ZWFjNTNjMmM5MTUzY2VlNzZmYTAyYzI4Mjc5YzJjOGE5OTllNDMwZmEwQGdyb3VwLmNhbGVuZGFyLmdvb2dsZS5jb20"
});

const $ = (selector) => document.querySelector(selector);
const form = $("#booking-form");
const state = { date: null, spot: null };
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
function shopToday() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: CONFIG.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type) => Number(parts.find((entry) => entry.type === type).value);
  return new Date(part("year"), part("month") - 1, part("day"), 12);
}
const today = shopToday();
const lastDate = new Date(today);
lastDate.setDate(lastDate.getDate() + CONFIG.bookingHorizonDays);
let month = new Date(today.getFullYear(), today.getMonth(), 1, 12);
function isBookable(date) {
  return date >= shopToday() && date <= lastDate && ![0, 6].includes(date.getDay()) && !CONFIG.closedDates.includes(dateKey(date));
}
function prettyDate(date) { return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }); }
function renderCalendar() {
  $("#month-label").textContent = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const grid = $("#date-grid");
  grid.replaceChildren();
  const offset = (month.getDay() + 6) % 7;
  for (let i = 0; i < offset; i++) grid.append(document.createElement("span"));
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  for (let day = 1; day <= days; day++) {
    const date = new Date(month.getFullYear(), month.getMonth(), day, 12);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = day;
    button.disabled = !isBookable(date);
    button.setAttribute("aria-label", `${prettyDate(date)}${button.disabled ? ", unavailable" : ", preview date"}`);
    button.setAttribute("aria-pressed", String(state.date !== null && dateKey(state.date) === dateKey(date)));
    button.addEventListener("click", () => {
      state.date = date; state.spot = null;
      renderCalendar(); renderSpots(); updateSummary();
      // Re-rendering replaces the button: preserve keyboard focus on the selected date.
      grid.querySelector('[aria-pressed="true"]').focus();
    });
    grid.append(button);
  }
  $("#previous-month").disabled = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();
  $("#next-month").disabled = month.getFullYear() === lastDate.getFullYear() && month.getMonth() === lastDate.getMonth();
}
function renderSpots() {
  $("#selected-date").textContent = prettyDate(state.date);
  $("#availability-note").textContent = "2 preview spots · live availability not connected";
  const container = $("#spot-options");
  container.replaceChildren();
  for (let spot = 1; spot <= CONFIG.spotsPerDay; spot++) {
    const label = document.createElement("label"); label.className = "spot";
    const input = document.createElement("input");
    input.type = "radio"; input.name = "spot"; input.value = String(spot); input.required = true;
    input.addEventListener("change", () => { state.spot = spot; updateSummary(); });
    label.append(input, document.createTextNode(`Spot ${spot}`)); container.append(label);
  }
}
function updateSummary() {
  $("#form-status").textContent = "";
  const service = new FormData(form).get("service");
  $("#booking-summary").textContent = service && state.date && state.spot
    ? `${service} · ${state.date.toLocaleDateString("en-US", {month:"short", day:"numeric"})} · Spot ${state.spot}`
    : "Choose a service, date and spot to continue.";
}
$("#calendar-link").href = CONFIG.calendarShareUrl;
const logo = $("#shop-logo");
function showLogo() { if (logo.naturalWidth > 0) { logo.hidden = false; $("#logo-fallback").hidden = true; } }
logo.addEventListener("load", showLogo); showLogo();
$("#previous-month").addEventListener("click", () => { month.setMonth(month.getMonth() - 1); renderCalendar(); });
$("#next-month").addEventListener("click", () => { month.setMonth(month.getMonth() + 1); renderCalendar(); });
form.addEventListener("change", () => {
  const other = new FormData(form).get("service") === "Other";
  $("#notes").required = other;
  $("#notes-label").textContent = other ? "Describe the work you need (required)" : "Anything we should know? (optional)";
  updateSummary();
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!state.date || !isBookable(state.date) || !state.spot) {
    $("#form-status").textContent = "Please choose a weekday and one of its two spots.";
    $("#date-grid button:not(:disabled)")?.focus(); return;
  }
  const data = new FormData(form);
  for (const key of ["name", "email", "vehicle", ...(data.get("service") === "Other" ? ["notes"] : [])]) {
    if (!String(data.get(key) || "").trim()) {
      $("#form-status").textContent = "Please complete your details, including a description for other work.";
      form.elements.namedItem(key).focus(); return;
    }
  }
  const entries = [
    ["Service", data.get("service")], ["Date", prettyDate(state.date)],
    ["Booking place", `Spot ${state.spot} · appointment time to be confirmed`],
    ["Name", data.get("name")], ["Email", data.get("email")], ["Vehicle", data.get("vehicle")]
  ];
  if (String(data.get("notes")).trim()) entries.push(["Notes", data.get("notes")]);
  const details = $("#review-details"); details.replaceChildren();
  for (const [title, value] of entries) {
    const dt = document.createElement("dt"), dd = document.createElement("dd");
    dt.textContent = title; dd.textContent = value; details.append(dt, dd);
  }
  $("#review-dialog").showModal();
});
$("#close-review").addEventListener("click", () => $("#review-dialog").close());
$("#edit-booking").addEventListener("click", () => $("#review-dialog").close());
renderCalendar();
