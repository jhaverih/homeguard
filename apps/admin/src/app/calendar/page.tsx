'use client';
import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api';

interface ScheduleEvent {
  id: string;
  scheduledDate: string;
  status: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  customerNotes: string | null;
  vendorNotes: string | null;
  customer: { id: string; name: string; email: string; phone: string };
  vendor: { id: string; name: string; email: string; phone: string } | null;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  ACCEPTED:       { bg: 'bg-blue-100',   text: 'text-blue-800',   dot: 'bg-blue-500',   label: 'Scheduled' },
  VENDOR_EN_ROUTE:{ bg: 'bg-amber-100',  text: 'text-amber-800',  dot: 'bg-amber-500',  label: 'En Route' },
  IN_PROGRESS:    { bg: 'bg-purple-100', text: 'text-purple-800', dot: 'bg-purple-500', label: 'In Progress' },
  COMPLETED:      { bg: 'bg-green-100',  text: 'text-green-800',  dot: 'bg-green-500',  label: 'Completed' },
  CANCELLED:      { bg: 'bg-red-100',    text: 'text-red-800',    dot: 'bg-red-500',    label: 'Cancelled' },
  PENDING:        { bg: 'bg-gray-100',   text: 'text-gray-700',   dot: 'bg-gray-400',   label: 'Pending' },
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function buildGrid(year: number, month: number): (number | null)[] {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function eventsForDay(events: ScheduleEvent[], year: number, month: number, day: number) {
  return events.filter((e) => {
    const d = new Date(e.scheduledDate);
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [filterVendor, setFilterVendor] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getSchedule(year, month);
      setEvents(data || []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
  };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelectedDay(today.getDate()); };

  const filtered = events.filter((e) => {
    if (filterVendor && !e.vendor?.name.toLowerCase().includes(filterVendor.toLowerCase())) return false;
    if (filterCustomer && !e.customer.name.toLowerCase().includes(filterCustomer.toLowerCase())) return false;
    return true;
  });

  const vendors = Array.from(new Map(events.filter((e) => e.vendor).map((e) => [e.vendor!.id, e.vendor!.name])).entries());
  const customers = Array.from(new Map(events.map((e) => [e.customer.id, e.customer.name])).entries());

  const grid = buildGrid(year, month);
  const dayEvents = selectedDay ? eventsForDay(filtered, year, month, selectedDay) : [];

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Visit Calendar</h1>
          <p className="text-sm text-gray-500 mt-1">All scheduled vendor visits for active agreements</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToday} className="px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Today
          </button>
          <button onClick={prevMonth} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors">
            &#8249;
          </button>
          <span className="text-base font-semibold text-gray-800 w-36 text-center">
            {MONTHS[month]} {year}
          </span>
          <button onClick={nextMonth} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors">
            &#8250;
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <select
            value={filterVendor}
            onChange={(e) => setFilterVendor(e.target.value)}
            className="pl-3 pr-8 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Vendors</option>
            {vendors.map(([id, name]) => <option key={id} value={name}>{name}</option>)}
          </select>
        </div>
        <div className="relative">
          <select
            value={filterCustomer}
            onChange={(e) => setFilterCustomer(e.target.value)}
            className="pl-3 pr-8 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Customers</option>
            {customers.map(([id, name]) => <option key={id} value={name}>{name}</option>)}
          </select>
        </div>
        {(filterVendor || filterCustomer) && (
          <button
            onClick={() => { setFilterVendor(''); setFilterCustomer(''); }}
            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Clear filters
          </button>
        )}
        <div className="ml-auto flex items-center gap-4 text-xs text-gray-500">
          {Object.entries(STATUS_STYLES).slice(0, 4).map(([status, s]) => (
            <span key={status} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex gap-6">
        {/* Calendar grid */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b border-gray-200">
            {DOW.map((d) => (
              <div key={d} className="py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {d}
              </div>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="grid grid-cols-7 divide-x divide-gray-100">
              {grid.map((day, idx) => {
                const dayEvs = day ? eventsForDay(filtered, year, month, day) : [];
                const isSelected = day === selectedDay;
                const overflowCount = dayEvs.length > 3 ? dayEvs.length - 2 : 0;
                const visible = overflowCount > 0 ? dayEvs.slice(0, 2) : dayEvs;

                return (
                  <div
                    key={idx}
                    onClick={() => day && setSelectedDay(isSelected ? null : day)}
                    className={`min-h-[100px] p-2 border-b border-gray-100 transition-colors ${
                      day ? 'cursor-pointer hover:bg-gray-50' : 'bg-gray-50/50'
                    } ${isSelected ? 'bg-blue-50 ring-2 ring-inset ring-blue-400' : ''}`}
                  >
                    {day && (
                      <>
                        <div className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium mb-1 ${
                          isToday(day)
                            ? 'bg-brand text-white'
                            : isSelected
                            ? 'bg-blue-100 text-blue-800'
                            : 'text-gray-700'
                        }`}>
                          {day}
                        </div>
                        <div className="space-y-1">
                          {visible.map((ev) => {
                            const s = STATUS_STYLES[ev.status] || STATUS_STYLES.PENDING;
                            return (
                              <div
                                key={ev.id}
                                onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev); }}
                                className={`text-xs px-2 py-1 rounded-md truncate cursor-pointer ${s.bg} ${s.text} hover:opacity-80`}
                              >
                                <span className="font-semibold">{formatTime(ev.scheduledDate)}</span>
                                {' '}{ev.customer.name.split(' ')[0]}
                              </div>
                            );
                          })}
                          {overflowCount > 0 && (
                            <div className="text-xs text-gray-500 pl-1">+{overflowCount} more</div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Day detail panel */}
        {selectedDay && (
          <div className="w-72 shrink-0 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-100 bg-gray-50">
              <p className="text-sm font-semibold text-gray-800">
                {MONTHS[month]} {selectedDay}, {year}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {dayEvents.length === 0 ? 'No visits scheduled' : `${dayEvents.length} visit${dayEvents.length > 1 ? 's' : ''}`}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {dayEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <div className="text-3xl mb-2">📭</div>
                  <p className="text-sm">No visits this day</p>
                </div>
              ) : (
                dayEvents.map((ev) => {
                  const s = STATUS_STYLES[ev.status] || STATUS_STYLES.PENDING;
                  return (
                    <button
                      key={ev.id}
                      onClick={() => setSelectedEvent(ev)}
                      className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-gray-800">{formatTime(ev.scheduledDate)}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.bg} ${s.text}`}>{s.label}</span>
                      </div>
                      <p className="text-sm text-gray-700 font-medium">{ev.customer.name}</p>
                      <p className="text-xs text-gray-500">{ev.address}, {ev.city}</p>
                      {ev.vendor && (
                        <p className="text-xs text-blue-600 mt-1">Vendor: {ev.vendor.name}</p>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Event detail modal */}
      {selectedEvent && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Visit Details</h2>
                <p className="text-sm text-gray-500 mt-0.5">{formatDate(selectedEvent.scheduledDate)} at {formatTime(selectedEvent.scheduledDate)}</p>
              </div>
              <button onClick={() => setSelectedEvent(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>

            {/* Status badge */}
            {(() => {
              const s = STATUS_STYLES[selectedEvent.status] || STATUS_STYLES.PENDING;
              return (
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${s.bg} ${s.text}`}>
                  <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                  {s.label}
                </span>
              );
            })()}

            {/* Customer */}
            <div className="bg-blue-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">Customer</p>
              <p className="text-sm font-semibold text-gray-900">{selectedEvent.customer.name}</p>
              <p className="text-sm text-gray-600">{selectedEvent.customer.email}</p>
              {selectedEvent.customer.phone && <p className="text-sm text-gray-600">{selectedEvent.customer.phone}</p>}
            </div>

            {/* Vendor */}
            <div className="bg-green-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">Vendor</p>
              {selectedEvent.vendor ? (
                <>
                  <p className="text-sm font-semibold text-gray-900">{selectedEvent.vendor.name}</p>
                  <p className="text-sm text-gray-600">{selectedEvent.vendor.email}</p>
                  {selectedEvent.vendor.phone && <p className="text-sm text-gray-600">{selectedEvent.vendor.phone}</p>}
                </>
              ) : (
                <p className="text-sm text-gray-500 italic">Not yet assigned</p>
              )}
            </div>

            {/* Location */}
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Location</p>
              <p className="text-sm text-gray-800">{selectedEvent.address}</p>
              <p className="text-sm text-gray-600">{selectedEvent.city}, {selectedEvent.state} {selectedEvent.zipCode}</p>
            </div>

            {/* Notes */}
            {(selectedEvent.customerNotes || selectedEvent.vendorNotes) && (
              <div className="space-y-3">
                {selectedEvent.customerNotes && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Customer Notes</p>
                    <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{selectedEvent.customerNotes}</p>
                  </div>
                )}
                {selectedEvent.vendorNotes && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Vendor Notes</p>
                    <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{selectedEvent.vendorNotes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
