import time
from datetime import timedelta, date


def year_of_gradschool():
    today = date.today()
    if today.month >= 9:
        year = today.year - 2022 + 1
    else:
        year = today.year - 2022

    stringdict = {
        0: "incoming",
        1: "first year",
        2: "second year",
        3: "third year",
        4: "fourth year",
        5: "fifth year"
    }
    return stringdict[year]
print(year_of_gradschool())
