import { localDbAdmin } from './localDbAdmin';

const ACTIVE_LOAN_STATUSES = [
  'pending', 'approved', 'released', 'claimed',
  'borrowed', 'issued', 'active', 'loaned', 'checked_out', 'overdue',
];

async function insertNotification(userId, type, title, body) {
  try {
    await localDbAdmin.from('notifications').insert([{
      user_id: userId, type, title, body, read: false,
    }]);
  } catch (e) {
    console.warn('reservationFulfillment: notification insert failed:', e.message);
  }
}

function pingLibrarians(bookTitle, studentName) {
  try {
    const session = JSON.parse(window.sessionStorage.getItem('shelfmaster-session') || 'null');
    fetch('/api/notify/librarians', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify({ book_title: bookTitle, student_name: studentName || '' }),
    }).catch(() => {});
  } catch (_) { /* best-effort, never block the caller */ }
}

/**
 * Call this right after a book copy is marked 'available' (a return was
 * processed). It looks up whoever has been waiting the longest for that
 * book — first come, first served — across both the dedicated
 * `reservations` table and the legacy `transactions` (status 'reserved')
 * fallback, and promotes that single reservation into a 'pending' borrow
 * request. That's what makes it disappear from the student's Reserved tab
 * and reappear in their Pending tab, and shows up for the librarian in
 * Pending Requests.
 *
 * If the person at the front of the line is already at their borrow
 * limit, they're skipped (their reservation stays 'waiting') and the next
 * person in line is tried instead, so one maxed-out student can't block
 * the whole queue.
 */
export async function fulfillNextReservation(bookId) {
  if (!bookId) return;

  try {
    const [{ data: resRows }, { data: legacyRows }, { data: book }, { data: policy }] = await Promise.all([
      localDbAdmin.from('reservations').select('id, user_id, created_at')
        .eq('book_id', bookId).eq('status', 'waiting')
        .order('created_at', { ascending: true }),
      localDbAdmin.from('transactions').select('id, user_id, created_at')
        .eq('book_id', bookId).eq('status', 'reserved')
        .order('created_at', { ascending: true }),
      localDbAdmin.from('books').select('title, borrow_duration_days').eq('id', bookId).maybeSingle(),
      localDbAdmin.from('fine_policy').select('max_borrow_count').limit(1).maybeSingle(),
    ]);

    // Merge both sources into one true first-come-first-served queue.
    const queue = [
      ...(resRows || []).map(r => ({ ...r, source: 'reservations' })),
      ...(legacyRows || []).map(r => ({ ...r, source: 'transactions' })),
    ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    if (queue.length === 0) return;

    const maxLoans  = Math.max(1, policy?.max_borrow_count || 3);
    const bookTitle = book?.title || 'A reserved book';
    const days      = book?.borrow_duration_days ?? 7;
    const dueDate   = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    for (const candidate of queue) {
      const { count } = await localDbAdmin.from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', candidate.user_id)
        .in('status', ACTIVE_LOAN_STATUSES);

      if ((count || 0) >= maxLoans) continue; // maxed out — try the next person in line

      if (candidate.source === 'reservations') {
        const { error: insErr } = await localDbAdmin.from('transactions').insert([{
          user_id: candidate.user_id, book_id: bookId, status: 'pending', due_date: dueDate,
        }]);
        if (insErr) { console.error('fulfillNextReservation insert error:', insErr); return; }

        const { error: updErr } = await localDbAdmin.from('reservations')
          .update({ status: 'fulfilled', notified_at: new Date().toISOString() })
          .eq('id', candidate.id);
        if (updErr) console.error('fulfillNextReservation reservations-update error:', updErr);
      } else {
        // Legacy path: it's already a transactions row — just flip its status.
        const { error } = await localDbAdmin.from('transactions')
          .update({ status: 'pending', due_date: dueDate })
          .eq('id', candidate.id);
        if (error) { console.error('fulfillNextReservation legacy-update error:', error); return; }
      }

      await insertNotification(
        candidate.user_id,
        'reservation_ready',
        'Your reserved book is ready!',
        `"${bookTitle}" is now available. Your reservation has moved to pending — the librarian will process it shortly.`
      );

      let studentName = '';
      try {
        const { data: userRow } = await localDbAdmin.from('users').select('name').eq('id', candidate.user_id).maybeSingle();
        studentName = userRow?.name || '';
      } catch (_) { /* best-effort */ }
      pingLibrarians(bookTitle, studentName);

      return; // one freed copy fulfills exactly one reservation
    }
  } catch (err) {
    console.error('fulfillNextReservation error:', err);
  }
}
