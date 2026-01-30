/**
 * Calendar Skill
 * 
 * Google Calendar integration for SparkyBot
 * - View events
 * - Create events (approval required)
 * - Find free slots
 * - VIP alerts
 */

import { calendar_v3 } from 'googleapis';
import { getCalendarService, PRIMARY_EMAIL } from '../../services/google-auth.js';

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  location?: string;
  attendees?: string[];
  description?: string;
  htmlLink?: string;
  calendarId?: string;
}

export interface TimeSlot {
  start: Date;
  end: Date;
  durationMinutes: number;
}

export interface CalendarSkillConfig {
  accounts: string[];
  defaultCalendarId: string;
  pollingIntervalActive: number;
  pollingIntervalInactive: number;
}

export const DEFAULT_CONFIG: CalendarSkillConfig = {
  accounts: [
    'johndempsey@johndempsey.us',
    'kdrsparky@gmail.com',
  ],
  defaultCalendarId: 'primary',
  pollingIntervalActive: 30,
  pollingIntervalInactive: 60,
};

/**
 * Get upcoming events from Google Calendar
 */
export async function getUpcomingEvents(
  days: number = 7,
  email?: string,
  maxResults: number = 50
): Promise<CalendarEvent[]> {
  const calendar = await getCalendarService(email || PRIMARY_EMAIL);
  if (!calendar) {
    throw new Error(`Cannot access calendar for ${email || PRIMARY_EMAIL}`);
  }

  const now = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);

  try {
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: endDate.toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    return events.map(mapGoogleEventToCalendarEvent);
  } catch (error: any) {
    console.error('Error fetching calendar events:', error.message);
    throw new Error(`Failed to fetch calendar events: ${error.message}`);
  }
}

/**
 * Get today's events
 */
export async function getTodaysEvents(email?: string): Promise<CalendarEvent[]> {
  const calendar = await getCalendarService(email || PRIMARY_EMAIL);
  if (!calendar) {
    throw new Error(`Cannot access calendar for ${email || PRIMARY_EMAIL}`);
  }

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  try {
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    return events.map(mapGoogleEventToCalendarEvent);
  } catch (error: any) {
    console.error('Error fetching today\'s events:', error.message);
    throw new Error(`Failed to fetch today's events: ${error.message}`);
  }
}

/**
 * Get events for a specific date
 */
export async function getEventsForDate(
  date: Date,
  email?: string
): Promise<CalendarEvent[]> {
  const calendar = await getCalendarService(email || PRIMARY_EMAIL);
  if (!calendar) {
    throw new Error(`Cannot access calendar for ${email || PRIMARY_EMAIL}`);
  }

  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

  try {
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    return events.map(mapGoogleEventToCalendarEvent);
  } catch (error: any) {
    console.error('Error fetching events for date:', error.message);
    throw new Error(`Failed to fetch events: ${error.message}`);
  }
}

/**
 * Create a new calendar event
 * NOTE: This should go through approval flow before being called
 */
export async function createEvent(
  title: string,
  start: Date,
  end: Date,
  options?: {
    description?: string;
    location?: string;
    attendees?: string[];
    email?: string;
  }
): Promise<CalendarEvent> {
  const email = options?.email || PRIMARY_EMAIL;
  const calendar = await getCalendarService(email);
  if (!calendar) {
    throw new Error(`Cannot access calendar for ${email}`);
  }

  const event: calendar_v3.Schema$Event = {
    summary: title,
    start: {
      dateTime: start.toISOString(),
      timeZone: 'America/Chicago', // CT timezone
    },
    end: {
      dateTime: end.toISOString(),
      timeZone: 'America/Chicago',
    },
  };

  if (options?.description) {
    event.description = options.description;
  }

  if (options?.location) {
    event.location = options.location;
  }

  if (options?.attendees && options.attendees.length > 0) {
    event.attendees = options.attendees.map(email => ({ email }));
  }

  try {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: options?.attendees ? 'all' : 'none',
    });

    return mapGoogleEventToCalendarEvent(response.data);
  } catch (error: any) {
    console.error('Error creating calendar event:', error.message);
    throw new Error(`Failed to create event: ${error.message}`);
  }
}

/**
 * Update an existing calendar event
 * NOTE: This should go through approval flow before being called
 */
export async function updateEvent(
  eventId: string,
  updates: Partial<{
    title: string;
    start: Date;
    end: Date;
    description: string;
    location: string;
    attendees: string[];
  }>,
  email?: string
): Promise<CalendarEvent> {
  const calendar = await getCalendarService(email || PRIMARY_EMAIL);
  if (!calendar) {
    throw new Error(`Cannot access calendar for ${email || PRIMARY_EMAIL}`);
  }

  const event: calendar_v3.Schema$Event = {};

  if (updates.title) {
    event.summary = updates.title;
  }

  if (updates.start) {
    event.start = {
      dateTime: updates.start.toISOString(),
      timeZone: 'America/Chicago',
    };
  }

  if (updates.end) {
    event.end = {
      dateTime: updates.end.toISOString(),
      timeZone: 'America/Chicago',
    };
  }

  if (updates.description !== undefined) {
    event.description = updates.description;
  }

  if (updates.location !== undefined) {
    event.location = updates.location;
  }

  if (updates.attendees) {
    event.attendees = updates.attendees.map(email => ({ email }));
  }

  try {
    const response = await calendar.events.patch({
      calendarId: 'primary',
      eventId,
      requestBody: event,
      sendUpdates: updates.attendees ? 'all' : 'none',
    });

    return mapGoogleEventToCalendarEvent(response.data);
  } catch (error: any) {
    console.error('Error updating calendar event:', error.message);
    throw new Error(`Failed to update event: ${error.message}`);
  }
}

/**
 * Delete a calendar event
 * NOTE: This should go through approval flow before being called
 */
export async function deleteEvent(
  eventId: string,
  email?: string
): Promise<void> {
  const calendar = await getCalendarService(email || PRIMARY_EMAIL);
  if (!calendar) {
    throw new Error(`Cannot access calendar for ${email || PRIMARY_EMAIL}`);
  }

  try {
    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
      sendUpdates: 'all',
    });
  } catch (error: any) {
    console.error('Error deleting calendar event:', error.message);
    throw new Error(`Failed to delete event: ${error.message}`);
  }
}

/**
 * Find free time slots in the calendar
 */
export async function findFreeSlots(
  durationMinutes: number,
  startDate: Date,
  endDate: Date,
  email?: string
): Promise<TimeSlot[]> {
  const calendar = await getCalendarService(email || PRIMARY_EMAIL);
  if (!calendar) {
    throw new Error(`Cannot access calendar for ${email || PRIMARY_EMAIL}`);
  }

  // Get all events in the date range
  const events = await getUpcomingEvents(
    Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
    email,
    100
  );

  // Define working hours (8am - 6pm CT)
  const workingHoursStart = 8;
  const workingHoursEnd = 18;

  const freeSlots: TimeSlot[] = [];
  const currentDate = new Date(startDate);

  while (currentDate < endDate) {
    // Skip weekends
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    // Set working hours for this day
    const dayStart = new Date(currentDate);
    dayStart.setHours(workingHoursStart, 0, 0, 0);
    
    const dayEnd = new Date(currentDate);
    dayEnd.setHours(workingHoursEnd, 0, 0, 0);

    // Get events for this day
    const dayEvents = events.filter(event => {
      const eventStart = new Date(event.start);
      return eventStart >= dayStart && eventStart < dayEnd;
    }).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    // Find gaps between events
    let slotStart = dayStart;

    for (const event of dayEvents) {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);

      // Check if there's a gap before this event
      const gapMinutes = (eventStart.getTime() - slotStart.getTime()) / (1000 * 60);
      if (gapMinutes >= durationMinutes) {
        freeSlots.push({
          start: new Date(slotStart),
          end: eventStart,
          durationMinutes: gapMinutes,
        });
      }

      // Move slot start to after this event
      if (eventEnd > slotStart) {
        slotStart = eventEnd;
      }
    }

    // Check for gap at end of day
    const endGapMinutes = (dayEnd.getTime() - slotStart.getTime()) / (1000 * 60);
    if (endGapMinutes >= durationMinutes) {
      freeSlots.push({
        start: new Date(slotStart),
        end: dayEnd,
        durationMinutes: endGapMinutes,
      });
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return freeSlots;
}

/**
 * Format events as a readable summary
 */
export function formatEventsSummary(events: CalendarEvent[]): string {
  if (events.length === 0) {
    return 'No events scheduled.';
  }

  const lines: string[] = [];
  let currentDate = '';

  for (const event of events) {
    const eventDate = new Date(event.start).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });

    if (eventDate !== currentDate) {
      if (currentDate) lines.push('');
      lines.push(`📅 **${eventDate}**`);
      currentDate = eventDate;
    }

    const startTime = new Date(event.start).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const endTime = new Date(event.end).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    let eventLine = `• ${startTime} - ${endTime}: ${event.title}`;
    if (event.location) {
      eventLine += ` 📍 ${event.location}`;
    }
    lines.push(eventLine);
  }

  return lines.join('\n');
}

/**
 * Format free slots as a readable summary
 */
export function formatFreeSlotsSummary(slots: TimeSlot[]): string {
  if (slots.length === 0) {
    return 'No free slots found in the specified time range.';
  }

  const lines: string[] = ['**Available time slots:**', ''];
  let currentDate = '';

  for (const slot of slots.slice(0, 10)) { // Limit to 10 slots
    const slotDate = slot.start.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });

    if (slotDate !== currentDate) {
      if (currentDate) lines.push('');
      lines.push(`📅 **${slotDate}**`);
      currentDate = slotDate;
    }

    const startTime = slot.start.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const endTime = slot.end.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const hours = Math.floor(slot.durationMinutes / 60);
    const mins = slot.durationMinutes % 60;
    const duration = hours > 0 
      ? `${hours}h${mins > 0 ? ` ${mins}m` : ''}`
      : `${mins}m`;

    lines.push(`• ${startTime} - ${endTime} (${duration})`);
  }

  if (slots.length > 10) {
    lines.push('', `...and ${slots.length - 10} more slots available`);
  }

  return lines.join('\n');
}

/**
 * Map Google Calendar event to our CalendarEvent interface
 */
function mapGoogleEventToCalendarEvent(
  googleEvent: calendar_v3.Schema$Event
): CalendarEvent {
  const start = googleEvent.start?.dateTime 
    ? new Date(googleEvent.start.dateTime)
    : googleEvent.start?.date 
      ? new Date(googleEvent.start.date)
      : new Date();

  const end = googleEvent.end?.dateTime
    ? new Date(googleEvent.end.dateTime)
    : googleEvent.end?.date
      ? new Date(googleEvent.end.date)
      : new Date();

  return {
    id: googleEvent.id || '',
    title: googleEvent.summary || '(No title)',
    start,
    end,
    location: googleEvent.location || undefined,
    attendees: googleEvent.attendees?.map(a => a.email || '').filter(Boolean),
    description: googleEvent.description || undefined,
    htmlLink: googleEvent.htmlLink || undefined,
  };
}

/**
 * Parse natural language date/time to Date object
 * Basic implementation - can be enhanced with a proper NLP library
 */
export function parseDateTime(text: string): Date | null {
  const now = new Date();
  const lowerText = text.toLowerCase();

  // Handle "today"
  if (lowerText.includes('today')) {
    return now;
  }

  // Handle "tomorrow"
  if (lowerText.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  // Handle "next week"
  if (lowerText.includes('next week')) {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek;
  }

  // Handle day names
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    if (lowerText.includes(days[i])) {
      const targetDay = i;
      const currentDay = now.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + daysUntil);
      return targetDate;
    }
  }

  // Try to parse as a date string
  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

/**
 * Parse time string to hours and minutes
 */
export function parseTime(text: string): { hours: number; minutes: number } | null {
  const lowerText = text.toLowerCase();

  // Match patterns like "2pm", "2:30pm", "14:30", "2 pm"
  const timePattern = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
  const match = lowerText.match(timePattern);

  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3]?.toLowerCase();

  if (period === 'pm' && hours < 12) {
    hours += 12;
  } else if (period === 'am' && hours === 12) {
    hours = 0;
  }

  return { hours, minutes };
}
