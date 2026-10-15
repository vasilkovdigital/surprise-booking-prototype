import { get, all, run, tx } from '../db.js';
import { hashPassword } from '../auth.js';
import { get_, post, html, redirect, flash, guard } from '../router.js';
import { render, esc } from '../views.js';

get_('/admin', (ctx) => {
  const r = guard(ctx, 'admin');
  if (r) return r;
  const partners = all('SELECT p.*, u.email FROM partners p JOIN users u ON u.id=p.user_id ORDER BY p.id');
  const body = `<h1>Админ: партнеры</h1>
    <div class="tablewrap"><table><tr><th>Партнер</th><th>Логин</th><th>Интеграция</th><th>Календарь</th></tr>
    ${partners.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.email)}</td>
      <td>${p.integration === 'cabinet' ? 'Кабинет' : 'Нет (только подарок)'}</td><td>${p.calendar_sync ? 'подключен' : '—'}</td></tr>`).join('')}</table></div>
    <h2>Добавить партнера</h2>
    <form class="card" method="post" action="/admin/partners">
      <div class="grid2"><label>Название<input name="name" required></label>
      <label>Email (логин)<input name="email" type="email" required></label>
      <label>Пароль<input name="password" required minlength="4" value="test1234"></label>
      <label>Название первой услуги<input name="service" required></label>
      <label>Цена, BYN<input name="price" type="number" min="0" step="0.01" value="100" required></label>
      <label>Тип<select name="mode">
        <option value="calendar">Календарь подключен (авто-подтверждение)</option>
        <option value="cabinet">Только кабинет (ручное подтверждение)</option>
        <option value="none">Без интеграции (только подарок)</option></select></label></div>
      <button class="btn sm">Создать</button></form>`;
  return html(render(ctx, 'Админ', body));
});

post('/admin/partners', (ctx) => {
  const r = guard(ctx, 'admin');
  if (r) return r;
  const b = ctx.body;
  const email = String(b.email || '').trim().toLowerCase();
  if (!b.name || !email || !b.service || get('SELECT 1 FROM users WHERE email=?', email)) {
    flash(ctx, 'Проверьте поля: email должен быть уникальным', 'error');
    return redirect('/admin');
  }
  tx(() => {
    const uid = run('INSERT INTO users (role,email,password_hash,name) VALUES (?,?,?,?)', 'partner', email, hashPassword(String(b.password || 'test1234')), b.name).id;
    const none = b.mode === 'none';
    const pid = run(
      'INSERT INTO partners (user_id,name,integration,calendar_sync,visit_min,notify_channel,contacts) VALUES (?,?,?,?,?,?,?)',
      uid, b.name, none ? 'none' : 'cabinet', b.mode === 'calendar' ? 1 : 0, 60, 'email', 'Контакты не заполнены').id;
    for (let wd = 0; wd < 7; wd++) {
      run('INSERT INTO schedule_rules (partner_id,weekday,start,"end",break_start,break_end) VALUES (?,?,?,?,?,?)', pid, wd, '10:00', '18:00', '13:00', '14:00');
    }
    run('INSERT INTO services (partner_id,title,description,price,capacity) VALUES (?,?,?,?,1)', pid, b.service, '', Number(b.price) || 0);
  });
  flash(ctx, 'Партнер создан');
  return redirect('/admin');
});
