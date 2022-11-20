from flask import Flask, render_template, url_for, send_from_directory
from database import get_events
from countdowns import year_of_gradschool
import os

app = Flask(__name__)

#app.config['SERVER_NAME'] = 'lukeaskew.xyz'
#source end/bin/activate

@app.route("/")
@app.route("/home")
def home():
    return render_template('home.html', yearstring = year_of_gradschool())


@app.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.join(app.root_path, 'static'),
                               'favicon.ico', mimetype='image/vnd.microsoft.icon')

@app.route("/courses")
def courses():
    return render_template('courses.html', title = "Projects", semesters = sorted(sorted(dbs.course_search.get_semester_list(), key = lambda x : x[0]), key = lambda x : x[1], reverse = True), courses = dbs.course_search.full_dict_list())

@app.route("/cv")
def cv():
    return render_template('cv.html', title = "CV")

@app.route("/research")
def blog():
    return render_template('research.html', title = "Research")

@app.route("/contact")
def contact():
    return render_template('contact.html', title = "Contact")

@app.route("/talks")
def talks():
    title = "Talks",


    events = get_events()
    show_upcoming = False
    if "upcoming" in [event["type"] for event in events]:
        show_upcoming = True

    return render_template('talks.html', title = "Talks", events = events,  show_upcoming = show_upcoming)


@app.route("/teaching")
def teaching():
    return render_template('teaching.html', title = 'Teaching')

#@app.route("/teaching")
#def teaching():
#    return render_template('teaching.html', title = "Teaching")

#@app.route("/webapps")
#def webapps():
#    return render_template('webapps.html', title = "Webapps")




if __name__ == '__main__':
#    app.run(debug=False, port = 80, host = "0.0.0.0")
    app.run(debug=True)
