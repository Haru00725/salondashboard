'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function Dashboard() {
  const [queue, setQueue] = useState([]);
  const [monthly, setMonthly] = useState({ totalBookings: 0, totalRevenue: 0 });
  const [weekly, setWeekly] = useState([]);
  const [loading, setLoading] = useState(true);

  // ---------- Fetch today's queue (waiting + in_chair, ordered by time) ----------
  const fetchQueue = useCallback(async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id,
        booking_time,
        status,
        customers ( name, whatsapp_number ),
        services ( name, price )
      `)
      .eq('booking_date', new Date().toISOString().split('T')[0])
      .in('status', ['confirmed', 'waiting', 'in_chair'])
      .order('booking_time', { ascending: true });

    if (!error && data) setQueue(data);
  }, []);

  // ---------- Fetch this month's totals ----------
  const fetchMonthly = useCallback(async () => {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('bookings')
      .select('id, services(price)')
      .gte('booking_date', firstOfMonth)
      .not('status', 'in', '("cancelled","no_show")');

    if (!error && data) {
      const totalRevenue = data.reduce((sum, b) => sum + (b.services?.price || 0), 0);
      setMonthly({ totalBookings: data.length, totalRevenue });
    }
  }, []);

  // ---------- Fetch last 7 days bookings for the bar chart ----------
  const fetchWeekly = useCallback(async () => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }

    const { data, error } = await supabase
      .from('bookings')
      .select('booking_date')
      .in('booking_date', days)
      .not('status', 'in', '("cancelled","no_show")');

    if (!error && data) {
      const counts = days.map(date => ({
        day: new Date(date).toLocaleDateString('en-IN', { weekday: 'short' }),
        count: data.filter(b => b.booking_date === date).length
      }));
      setWeekly(counts);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchQueue(), fetchMonthly(), fetchWeekly()]);
    setLoading(false);
  }, [fetchQueue, fetchMonthly, fetchWeekly]);

  useEffect(() => {
    fetchAll();

    // Realtime: refetch whenever bookings change (new booking, status update, etc.)
    const channel = supabase
      .channel('bookings-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        fetchQueue();
        fetchMonthly();
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [fetchAll, fetchQueue, fetchMonthly]);

  // ---------- Mark current in-chair customer as done, advance next waiting customer ----------
  async function markDone(currentBookingId) {
    await supabase
      .from('bookings')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', currentBookingId);

    const nextWaiting = queue.find(b => b.status !== 'in_chair' && b.id !== currentBookingId);
    if (nextWaiting) {
      await supabase
        .from('bookings')
        .update({ status: 'in_chair', updated_at: new Date().toISOString() })
        .eq('id', nextWaiting.id);
    }
    fetchQueue();
    fetchMonthly();
  }

  // ---------- Seat the next customer if the chair is empty ----------
  async function seatNext(bookingId) {
    await supabase
      .from('bookings')
      .update({ status: 'in_chair', updated_at: new Date().toISOString() })
      .eq('id', bookingId);
    fetchQueue();
  }

  const inChair = queue.find(b => b.status === 'in_chair');
  const waiting = queue.filter(b => b.status !== 'in_chair');
  const next = waiting[0];
  const maxWeekly = Math.max(...weekly.map(d => d.count), 1);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-sm text-neutral-500 font-mono uppercase tracking-widest">Loading queue…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-neutral-900 font-sans">
      <div className="max-w-md mx-auto px-4 pt-6 pb-12">

        {/* Header */}
        <header className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Today's queue</h1>
            <p className="text-xs text-neutral-500 font-mono uppercase tracking-widest mt-1">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
            Live
          </span>
        </header>

        {/* Up next hero card */}
        <p className="text-[10px] font-mono uppercase tracking-widest text-emerald-700 mb-2 pl-1">Up next</p>
        <div className="border border-emerald-100 rounded-2xl p-6 mb-5 bg-emerald-50">
          {next ? (
            <div className="flex items-center gap-4">
              <div className="text-4xl font-semibold text-emerald-600 min-w-[52px]">
                {String(waiting.indexOf(next) + 1).padStart(2, '0')}
              </div>
              <div className="flex-1">
                <p className="text-lg font-semibold text-neutral-900">{next.customers?.name || next.customers?.whatsapp_number}</p>
                <p className="text-sm text-neutral-500 mt-0.5">
                  {next.services?.name} · <span className="font-mono uppercase tracking-widest">{next.booking_time?.slice(0, 5)}</span>
                </p>
                <span className="inline-block text-[10px] font-mono uppercase tracking-widest text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full mt-3">
                  Notified 10 min before
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-500 text-center py-4">Queue is empty</p>
          )}
        </div>

        {/* In chair card */}
        <div className="border border-neutral-200 rounded-2xl p-4 mb-6 flex items-center justify-between bg-white">
          {inChair ? (
            <>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 text-lg">
                  ✂
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-900">{inChair.customers?.name || inChair.customers?.whatsapp_number}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">{inChair.services?.name} · In chair</p>
                </div>
              </div>
              <button
                onClick={() => markDone(inChair.id)}
                className="text-sm font-medium bg-emerald-600 text-white px-4 py-2 rounded-xl active:scale-95 transition-transform"
              >
                Mark done
              </button>
            </>
          ) : (
            <div className="flex items-center justify-between w-full">
              <p className="text-sm text-neutral-500 py-2">No one in the chair right now</p>
              {next && (
                <button
                  onClick={() => seatNext(next.id)}
                  className="text-sm font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-2 rounded-xl active:scale-95 transition-transform"
                >
                  Seat next
                </button>
              )}
            </div>
          )}
        </div>

        {/* Waiting list */}
        <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-3 pl-1">Waiting</p>
        <div className="flex flex-col gap-3 mb-8">
          {waiting.length === 0 && (
            <p className="text-sm text-neutral-500 text-center py-4">No one else waiting</p>
          )}
          {waiting.map((b, i) => (
            <div key={b.id} className="border border-neutral-200 rounded-2xl px-4 py-3.5 flex items-center gap-4 bg-white">
              <span className="text-xs font-mono uppercase tracking-widest text-neutral-500 min-w-[44px]">{b.booking_time?.slice(0, 5)}</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-neutral-900">{b.customers?.name || b.customers?.whatsapp_number}</p>
                <p className="text-xs text-neutral-500 mt-0.5">{b.services?.name}</p>
              </div>
              <span className="text-xs font-mono text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full min-w-[28px] text-center">
                {i + 1}
              </span>
            </div>
          ))}
        </div>

        {/* Monthly stats */}
        <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-3 pl-1">This month</p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="border border-neutral-200 rounded-2xl p-5 bg-white">
            <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-2">Total bookings</p>
            <p className="text-2xl font-semibold text-emerald-600">{monthly.totalBookings}</p>
          </div>
          <div className="border border-neutral-200 rounded-2xl p-5 bg-white">
            <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-2">Revenue</p>
            <p className="text-2xl font-semibold text-emerald-600">₹{monthly.totalRevenue.toLocaleString('en-IN')}</p>
          </div>
        </div>

        {/* Weekly bar chart */}
        <div className="border border-neutral-200 rounded-2xl p-5 pb-4 bg-white">
          <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-4">Bookings, last 7 days</p>
          <div className="flex items-end gap-2 h-24">
            {weekly.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-2">
                <div
                  className={`w-full rounded-t-sm min-h-[4px] ${
                    d.count === maxWeekly && d.count > 0 ? 'bg-emerald-600' : 'bg-neutral-100'
                  }`}
                  style={{ height: `${(d.count / maxWeekly) * 100}%` }}
                />
                <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-500">{d.day}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
