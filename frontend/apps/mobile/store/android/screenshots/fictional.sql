-- Fictional data for the Google Play phone screenshots (PAD-608 item 5).
--
-- Runs AFTER the E2E seed (frontend/apps/web/e2e/scripts/seed.py) on the THROWAWAY database
-- levelup_store_shots, never on a shared or production database. It repaints every person, the
-- academy, the class titles and the visible chat text that the captured screens can show, and
-- sets the coach's and the student's account language to Portuguese (the app renders pt-PT).
-- Usernames and passwords are NOT touched: capture.yaml logs in with them.
--
-- Idempotent: every row is addressed by a key the script never changes (username, the seed's
-- original lesson title, the seed's original message text), so a second run changes nothing.
-- Mapping: the coach and player names of the 2026-09 fictional set (Bruno Tavares, Paulo Pires,
-- Tiago Paiva, Joana Teixeira, Luis Fonseca, Andre Nunes, Ines Pinto, Pedro Torres, Manuel
-- Trindade, Sofia Martins, Ana Ribeiro, Helena Gomes); the 15 further names fill the rest of the
-- seeded roster (the coach has 31 players) and are invented the same way.
-- Table/column names: backend/padel_app/models/{users,clubs,lessons,messages,
-- Association_CoachPlayer,coach_levels,evaluation_category,coaches}.py (cited per statement).
\set ON_ERROR_STOP on
BEGIN;

-- 1. Named accounts: users.name (users.py:15), users.language (users.py:55).
--    Seeded in seed.py:102-196 (coach, students, ghost), seed.py:305-317 (27 filler players).
UPDATE users AS u
   SET name = v.new_name
  FROM (VALUES
    ('e2e-coach',     'Bruno Tavares'),
    ('e2e-student',   'Ana Ribeiro'),
    ('e2e-student-2', 'Helena Gomes'),
    ('e2e-student-3', 'Rita Cardoso'),
    ('ghost-player',  'Miguel Sousa'),
    ('e2e-coach-nolevels', 'Carla Mendes'),
    ('e2e-coach-noclub',   'Jorge Alves'),
    ('e2e-legacy-student', 'Pedro Lemos'),
    ('filler-player-01', 'André Nunes'),
    ('filler-player-02', 'Inês Pinto'),
    ('filler-player-03', 'Pedro Torres'),
    ('filler-player-04', 'Manuel Trindade'),
    ('filler-player-05', 'Sofia Martins'),
    ('filler-player-06', 'Paulo Pires'),
    ('filler-player-07', 'Tiago Paiva'),
    ('filler-player-08', 'Joana Teixeira'),
    ('filler-player-09', 'Luís Fonseca'),
    ('filler-player-10', 'Carolina Antunes'),
    ('filler-player-11', 'Diogo Carvalho'),
    ('filler-player-12', 'Beatriz Lopes'),
    ('filler-player-13', 'Gonçalo Moreira'),
    ('filler-player-14', 'Marta Campos'),
    ('filler-player-15', 'Ricardo Matos'),
    ('filler-player-16', 'Catarina Faria'),
    ('filler-player-17', 'Filipe Rocha'),
    ('filler-player-18', 'Mariana Barros'),
    ('filler-player-19', 'Rui Cunha'),
    ('filler-player-20', 'Teresa Matias'),
    ('filler-player-21', 'Hugo Pereira'),
    ('filler-player-22', 'Raquel Duarte'),
    ('filler-player-23', 'Nuno Vieira'),
    ('filler-player-24', 'Leonor Marques'),
    ('filler-player-25', 'Bernardo Lima'),
    ('filler-player-26', 'Susana Moura'),
    ('filler-player-27', 'Vasco Correia')
  ) AS v(username, new_name)
 WHERE u.username = v.username;

-- 2. Emails (users.py:17, unique, nullable): the seed's e2e-*@test.com / fillerNN@test.com would
--    show on a player's detail. Keyed by the row id so it stays unique; the ghost has none.
UPDATE users
   SET email = 'demo' || id || '@example.pt'
 WHERE email IS NOT NULL
   AND (username IN ('e2e-coach', 'e2e-student', 'e2e-student-2', 'e2e-student-3')
        OR username LIKE 'filler-player-%');

-- 3. Portuguese UI for the two accounts the flow signs in as (users.py:55, String(2), 'pt').
UPDATE users SET language = 'pt' WHERE username IN ('e2e-coach', 'e2e-student');

-- 4. The academy (clubs.py:17-19; seed.py:238 creates the only club, "E2E Club").
UPDATE clubs
   SET name = 'ACADEMIA NORTE',
       description = 'Escola de padel para todos os níveis.',
       location = 'Porto'
 WHERE name = 'E2E Club' OR name = 'ACADEMIA NORTE';

-- 5. Class titles (lessons.py:17), keyed by the seed's titles (seed.py:344, 417, 472, 531, 633,
--    696, 763, 933, 981). lessons.description (lessons.py:18) is not set by the seed.
UPDATE lessons AS l
   SET title = v.new_title
  FROM (VALUES
    ('E2E Academy Class',         'Aula de Grupo Iniciação'),
    ('E2E Declined Count Class',  'Aula de Grupo Manhã'),
    ('E2E Recurring Class',       'Treino Semanal de Terça'),
    ('E2E Pending Confirm Class', 'Aula de Grupo Tarde'),
    ('E2E Attended Class',        'Treino de Técnica'),
    ('E2E Missed Class',          'Treino de Bandeja'),
    ('E2E Validation Class',      'Treino de Voleio'),
    ('E2E Upcoming Class',        'Treino de Serviço'),
    ('E2E Eval Yesterday Class',  'Aula de Direita')
  ) AS v(old_title, new_title)
 WHERE l.title = v.old_title;

-- 6. Visible chat text (messages.py:37). Seeded in seed.py:~441-452 (coach <-> student),
--    ~489-494 (coach <-> student 3) and ~515 (the invitations, which name the pending class).
UPDATE messages SET text = 'Bem-vinda à academia!' WHERE text = 'Welcome to the academy!';
UPDATE messages SET text = 'Obrigada, treinador!'   WHERE text = 'Thanks coach!';
UPDATE messages SET text = 'Até para a semana!'      WHERE text = 'See you next week!';
UPDATE messages
   SET text = replace(text, 'E2E Pending Confirm Class', 'Aula de Grupo Tarde')
 WHERE text LIKE '%E2E Pending Confirm Class%';

-- 7. Coach's notes on players (Association_CoachPlayer.py:30, table coach_in_player):
--    "E2E test player", "E2E test player 2" (seed.py:~268-284) and "Filler player NN" (seed.py:~326).
UPDATE coach_in_player AS cp
   SET notes = v.new_notes
  FROM players p
  JOIN users u ON u.id = p.user_id
  JOIN (VALUES
    ('e2e-student',   'Joga à direita. Boa evolução no voleio.'),
    ('e2e-student-2', 'Joga à esquerda. A trabalhar a bandeja.')
  ) AS v(username, new_notes) ON v.username = u.username
 WHERE cp.player_id = p.id;
UPDATE coach_in_player SET notes = NULL WHERE notes LIKE 'Filler player %';

-- 8. Levels and the evaluation category the screens show (coach_levels.py:26 label;
--    evaluation_category.py:31 name, table evaluation_categories). Codes (B1, I1) stay.
UPDATE coach_levels SET label = 'Intermédio' WHERE label = 'Intermediate'
   AND coach_id = (SELECT c.id FROM coaches c JOIN users u ON u.id = c.user_id WHERE u.username = 'e2e-coach');
UPDATE coach_levels SET label = 'Iniciado' WHERE label = 'Beginner'
   AND coach_id = (SELECT c.id FROM coaches c JOIN users u ON u.id = c.user_id WHERE u.username = 'e2e-coach');
UPDATE evaluation_categories SET name = 'Direita' WHERE name = 'Forehand'
   AND coach_id = (SELECT c.id FROM coaches c JOIN users u ON u.id = c.user_id WHERE u.username = 'e2e-coach');

-- 9. Guard: nothing the screens render may still read as test data. Fails the load (and so the
--    job) before an emulator is booted.
-- The rejected-coach account and its reason are never on these screens; repainted anyway so the
-- whole database is clean (no test marker anywhere, checked by the sweep in the PR).
UPDATE users SET name = 'Rui Moreira' WHERE username = 'e2e-coach-rejected';
UPDATE coaches SET rejection_reason = 'Perfil incompleto'
 WHERE user_id = (SELECT id FROM users WHERE username = 'e2e-coach-rejected')
   AND rejection_reason IS NOT NULL;

DO $$
DECLARE leftover integer;
BEGIN
  SELECT (SELECT count(*) FROM users WHERE status = 'active' AND (name ~* '(e2e|filler|maestro|test)'))
       + (SELECT count(*) FROM clubs WHERE name ~* '(e2e|filler|maestro|test)')
       + (SELECT count(*) FROM lessons WHERE title ~* '(e2e|filler|maestro|test)')
       + (SELECT count(*) FROM messages WHERE text ~* '(e2e|filler|maestro)')
    INTO leftover;
  IF leftover > 0 THEN
    RAISE EXCEPTION 'fictional.sql left % test-looking rows', leftover;
  END IF;
END $$;

COMMIT;
