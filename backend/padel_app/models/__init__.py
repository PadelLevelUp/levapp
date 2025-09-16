from .backend_apps import Backend_App
from .clubs import Club
from .coach_levels import CoachLevel
from .coaches import Coach
from .lesson_instances import LessonInstance
from .lessons import Lesson
from .messages import Message
from .player_level_history import PlayerLevelHistory
from .players import Player
from .users import User
from .Association_CoachClub import Association_CoachClub
from .Association_CoachLesson import Association_CoachLesson
from .Association_CoachLessonInstance import Association_CoachLessonInstance
from .Association_CoachPlayer import Association_CoachPlayer
from .Association_PlayerClub import Association_PlayerClub
from .Association_PlayerLesson import Association_PlayerLesson
from .Association_PlayerLessonInstance import Association_PlayerLessonInstance

MODELS = {
    "Backend_App": Backend_App,
    "Club": Club,
    "CoachLevel": CoachLevel,
    "Coach": Coach,
    "LessonInstance": LessonInstance,
    "Lesson": Lesson,
    "Message": Message,
    "PlayerLevelHistory": PlayerLevelHistory,
    "Player": Player,
    "User": User,
    "Association_CoachClub": Association_CoachClub,
    "Association_CoachLesson": Association_CoachLesson,
    "Association_CoachLessonInstance": Association_CoachLessonInstance,
    "Association_CoachPlayer": Association_CoachPlayer,
    "Association_PlayerClub": Association_PlayerClub,
    "Association_PlayerLesson": Association_PlayerLesson,
    "Association_PlayerLessonInstance": Association_PlayerLessonInstance,
}
