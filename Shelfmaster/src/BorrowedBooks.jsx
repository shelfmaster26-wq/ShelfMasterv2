import React, { useEffect, useState } from 'react';
import { localDb } from './localDbClient';
import Toast from './Toast';
import BookLoader from './BookLoader';

export default function BorrowedBooks() {
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const showToast = (message, type = 'success', title) => setToast({ message, type, title });

  useEffect(() => {
    fetchLoans();
  }, []);

  async function fetchLoans() {
    const { data: { user } } = await localDb.auth.getUser();
    if (!user) return;

    // Fetch transactions where the user hasn't returned the book yet
    const { data, error } = await localDb
      .from('transactions')
      .select(`
        id,
        due_date,
        transaction_type,
        book_id,
        books (
          title,
          authors,
          available_stock
        )
      `)
      .eq('user_id', user.id)
      .eq('transaction_type', 'borrow'); // Only show current borrows

    if (error) {
      console.error(error);
      showToast("Couldn't load your borrowed books. Please refresh the page.", 'error', 'Load Failed');
    }
    else setLoans(data || []);
    setLoading(false);
  }

  const handleReturn = async (loanId, bookId, currentAvailableStock) => {
    // 1. Update transaction to 'return'
    const { error: transError } = await localDb
      .from('transactions')
      .update({ transaction_type: 'return', return_date: new Date().toISOString() })
      .eq('id', loanId);

    if (!transError) {
      // 2. Put the book back into available stock
      await localDb
        .from('books')
        .update({ available_stock: currentAvailableStock + 1 })
        .eq('id', bookId);

      showToast('Your return has been recorded. The book is now available for others.', 'success', 'Book Returned');
      fetchLoans(); // Refresh the list
    } else {
      showToast("Couldn't process the return. Please try again or contact the librarian.", 'error', 'Return Failed');
    }
  };

  if (loading) return <BookLoader message="Loading your books" />;

  return (
    <div style={{ padding: '2rem' }}>
      <Toast {...toast} onClose={() => setToast({ message: '' })} />
      <h2>My Borrowed Books</h2>
      {loans.length === 0 ? (
        <p>You have no active borrows.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #eee' }}>
              <th style={{ padding: '10px' }}>Book Title</th>
              <th style={{ padding: '10px' }}>Due Date</th>
              <th style={{ padding: '10px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loans.map((loan) => (
              <tr key={loan.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '10px' }}>
                  <strong>{loan.books.title}</strong><br/>
                  <small>{loan.books.authors}</small>
                </td>
                <td style={{ padding: '10px' }}>
                  {new Date(loan.due_date).toLocaleDateString()}
                </td>
                <td style={{ padding: '10px' }}>
                  <button 
                    onClick={() => handleReturn(loan.id, loan.book_id, loan.books.available_stock)}
                    style={{ backgroundColor: '#f59e0b', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Return Book
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}