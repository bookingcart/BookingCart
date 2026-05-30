const fs = require('fs');

const path = 'src/pages/AdminPage.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add deleteUser function to UsersPanel
const deleteFunc = `  async function deleteUser(email) {
    if (!confirm(\`Are you sure you want to delete \${email}? This action cannot be undone.\`)) return;
    try {
      const t = localStorage.getItem('bookingcart_jwt_token') || localStorage.getItem('bookingcart_google_id_token') || '';
      const resp = await fetch(\`/api/user?email=\${encodeURIComponent(email)}\`, {
        method: 'DELETE',
        headers: t ? { 'Authorization': \`Bearer \${t}\` } : {}
      });
      const data = await resp.json();
      if (data.ok) {
        alert('User successfully deleted.');
        loadUsers();
      } else {
        alert('Failed to delete user: ' + (data.error || 'Unknown error'));
      }
    } catch (e) {
      alert('Network error while deleting user.');
    }
  }

  function copyEmail(email) {`;

if (!content.includes('async function deleteUser')) {
  content = content.replace('  function copyEmail(email) {', deleteFunc);
}

// 2. Add "Actions" column to table header
if (!content.includes('<th className="text-right px-6 py-3 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Actions</th>')) {
  content = content.replace(
    '<th className="text-right px-6 py-3 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Copy</th>',
    '<th className="text-right px-6 py-3 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Copy</th>\n                <th className="text-right px-6 py-3 font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-xs">Actions</th>'
  );
}

// 3. Add Delete button to table body
const deleteButtonHtml = `                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => deleteUser(u.email)}
                      title="Delete user"
                      className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 hover:text-red-700">
                      <i className="ph ph-trash mr-1" />
                      Delete
                    </button>
                  </td>
                </tr>`;

if (!content.includes('title="Delete user"')) {
  content = content.replace(
    '                  </td>\n                </tr>',
    '                  </td>\n' + deleteButtonHtml
  );
}

fs.writeFileSync(path, content);
