from padel_app.models import (
    Player,
    User,
    Association_CoachPlayer,
    PlayerLevelHistory
)

from padel_app.tools.request_adapter import JsonRequestAdapter

def create_player_helper(data):
    
    player = Player()
    player_form = player.get_create_form()
    
    user = User()
    user_form = user.get_create_form()
    
    user_fake_request = JsonRequestAdapter(data['user'], user_form)
    user_values = user_form.set_values(user_fake_request)

    user.update_with_dict(user_values)
    user.create()
    
    player_data = {
        'user': user.id
    }
    
    player_fake_request = JsonRequestAdapter(player_data, player_form)
    player_values = player_form.set_values(player_fake_request)

    player.update_with_dict(player_values)
    player.create()

    if data.get("coach"):
        rel_data = {
            'coach': data.get("coach"),
            'player': player.id,
            'level': data.get('level', None),
            'side': data.get('side', None),
            'notes': data.get('notes', None),
        }
        rel = Association_CoachPlayer()
        
        rel_form = rel.get_create_form()
        
        rel_fake_request = JsonRequestAdapter(rel_data, rel_form)
        rel_values = rel_form.set_values(rel_fake_request)
        
        rel.update_with_dict(rel_values)
        rel.create()

    if data.get("coach") and data['level']:
        PlayerLevelHistory(
            coach_id=data["coach"],
            player_id=player.id,
            level_id=data['level']
        ).create()

    return player.coach_player_info(data["coach"])


def edit_player_helper(player, rel, data):
    user_form = player.user.get_edit_form()
    user_fake_request = JsonRequestAdapter(data['user'], user_form)
    user_values = user_form.set_values(user_fake_request)

    player.user.update_with_dict(user_values)
    player.user.save()
    
    rel_form = rel.get_edit_form()
    rel_fake_request = JsonRequestAdapter(data['relation'], rel_form)
    rel_values = rel_form.set_values(rel_fake_request)

    rel.update_with_dict(rel_values)
    rel.save()
    
    return player.coach_player_info(data["coach"])
    