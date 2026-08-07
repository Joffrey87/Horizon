// Test de bout en bout : auth par mot de passe (utilisateur de test), CRUD sur
// les 7 objets à travers RLS, puis nettoyage. Sort avec code ≠ 0 en cas d'échec.
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL ?? 'https://zahrgmswfejabqpgjkfe.supabase.co'
const anon = process.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_izDTsSC9xZOapRmmkBmN-A_t9L2VMZr'
const supabase = createClient(url, anon)

const fail = (msg, err) => { console.error('ÉCHEC:', msg, err ?? ''); process.exit(1) }
const ok = (msg) => console.log('OK —', msg)

const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
  email: 'test-horizon@example.com', password: 'HorizonTest#2026',
})
if (authErr) fail('connexion', authErr.message)
ok(`connecté (${auth.user.id.slice(0, 8)}…)`)
const uid = auth.user.id

// Domaine
const { data: dom, error: e1 } = await supabase.from('domains')
  .insert({ user_id: uid, name: 'Test Travail', color: '#d97706' }).select().single()
if (e1) fail('insert domaine', e1.message); ok('domaine créé')

// Objectif
const { data: obj, error: e2 } = await supabase.from('objectives')
  .insert({ user_id: uid, domain_id: dom.id, title: 'Objectif test', horizon: 'trimestriel' }).select().single()
if (e2) fail('insert objectif', e2.message); ok('objectif créé')

// Projet
const { data: pro, error: e3 } = await supabase.from('projects')
  .insert({ user_id: uid, domain_id: dom.id, objective_id: obj.id, title: 'Projet test', next_action: 'Premier pas' })
  .select().single()
if (e3) fail('insert projet', e3.message); ok('projet créé')

// Tâche liée au projet + trigger last_activity_at
const before = pro.last_activity_at
await new Promise((r) => setTimeout(r, 1100))
const { error: e4 } = await supabase.from('tasks')
  .insert({ user_id: uid, project_id: pro.id, title: 'Tâche test', importance: 3, urgence: 2 })
if (e4) fail('insert tâche', e4.message); ok('tâche créée')
const { data: pro2 } = await supabase.from('projects').select('last_activity_at').eq('id', pro.id).single()
if (pro2.last_activity_at === before) fail('trigger last_activity_at inactif')
ok('trigger de dernière activité fonctionne')

// Tâche sans ancrage → doit être REJETÉE (contrainte task_anchored)
const { error: e5 } = await supabase.from('tasks').insert({ user_id: uid, title: 'Orpheline' })
if (!e5) fail('la contrainte task_anchored aurait dû rejeter une tâche sans projet ni domaine')
ok('contrainte task_anchored respectée')

// Idée, habitude + log, revue, layout, settings
const { error: e6 } = await supabase.from('ideas')
  .insert({ user_id: uid, domain_id: dom.id, title: 'Idée test' })
if (e6) fail('insert idée', e6.message); ok('idée créée')

const { data: hab, error: e7 } = await supabase.from('habits')
  .insert({ user_id: uid, domain_id: dom.id, title: 'Habitude test', frequency_type: 'weekly', weekly_target: 3 })
  .select().single()
if (e7) fail('insert habitude', e7.message)
const { error: e8 } = await supabase.from('habit_logs')
  .insert({ user_id: uid, habit_id: hab.id, log_date: new Date().toISOString().slice(0, 10) })
if (e8) fail('insert habit_log', e8.message); ok('habitude + log créés')

const { error: e9 } = await supabase.from('reviews')
  .insert({ user_id: uid, kind: 'hebdo', answers: { projets: 'ras' }, week_focus: [], completed: true })
if (e9) fail('insert revue', e9.message); ok('revue créée')

const { error: e10 } = await supabase.from('layouts')
  .insert({ user_id: uid, name: 'Test', data: { positions: { a: { x: 0, y: 0 } } } })
if (e10) fail('insert layout', e10.message); ok('layout créé')

const { error: e11 } = await supabase.from('settings').upsert({ user_id: uid, wip_limit: 4 })
if (e11) fail('upsert settings', e11.message); ok('settings enregistrés')

// RLS : un client anonyme ne doit rien voir
const anonClient = createClient(url, anon)
const { data: leak } = await anonClient.from('projects').select('*')
if (leak && leak.length > 0) fail('RLS : des données fuitent vers un client non connecté !')
ok('RLS vérifiée (aucune fuite anonyme)')

// Nettoyage (cascade depuis le domaine) — settings/revues/layouts liés à l'utilisateur restent, supprimés avec l'utilisateur
await supabase.from('domains').delete().eq('id', dom.id)
ok('nettoyage effectué')

console.log('\\nTOUS LES TESTS PASSENT ✔')
process.exit(0)
