"""PAD-574 — notifications.semi-auto-approval rule 4 (B-521): a bundle says why each spot is
open. A spot a student freed carries the student; a spot the class never filled is ``openSpot``
with no name and its side; the persisted Assistant text makes the same split.
"""
from padel_app.tests.test_semi_auto_approval import _mark_absent, _patched_io, _seed_world


def test_a_never_filled_spot_is_an_open_spot_and_a_freed_spot_names_the_student(app):
    from padel_app.models import Message
    from padel_app.services.notification_service import _create_structural_vacancies, _ensure_vacancy_for_player
    from padel_app.services.replacement_approval_service import create_approval_prompts

    with app.app_context():
        world = _seed_world("pad574", enrolled=2, n_candidates=2, max_players=4)
        instance, coach, config = world["instance"], world["coach"], world["config"]
        alice_user, alice = world["enrolled"][0]
        _mark_absent(instance, alice)
        freed = _ensure_vacancy_for_player(instance, coach.id, alice.id)
        never_filled = _create_structural_vacancies(instance, coach.id)
        assert len(never_filled) == 2, "a class of 4 with 2 enrolled has two never-filled spots"
        with _patched_io():
            bundle = create_approval_prompts([freed, *never_filled], instance, coach.id, config)

        by_id = {v["vacancyId"]: v for v in bundle["vacancies"]}
        assert by_id[freed.id]["openSpot"] is False
        assert by_id[freed.id]["declinedPlayerName"] == alice_user.name
        for v in never_filled:
            assert by_id[v.id]["openSpot"] is True
            assert by_id[v.id]["declinedPlayerId"] is None and by_id[v.id]["declinedPlayerName"] is None
            assert by_id[v.id]["side"] == v.side, "the side the spot asks for first travels with it"

        text = Message.query.filter(Message.text.contains("Open spot.")).order_by(Message.id.desc()).first().text
        assert text.count("Open spot.") == 2
        assert f"Spot freed by {alice_user.name}." in text
        assert "dropped out" not in text and "A player" not in text
