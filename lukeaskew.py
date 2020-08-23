from flask import Flask, render_template, url_for
import customdatabase.database as dbs


app = Flask(__name__)

@app.route("/")
@app.route("/home")
def home():
    return render_template('home.html')


@app.route("/projects")
def projects():
    return render_template('projects.html', title = "Projects", projects = dbs.project_search.dict_formatted())

@app.route("/courses")
def courses():
    return render_template('courses.html', title = "Projects", semesters = sorted(sorted(dbs.course_search.get_semester_list(), key = lambda x : x[0]), key = lambda x : x[1], reverse = True), courses = dbs.course_search.full_dict_list())

@app.route("/cv")
def cv():
    return render_template('cv.html', title = "Projects")

@app.route("/teaching")
def teaching():
    return render_template('teaching.html', title = "Teaching")

#@app.route("/webapps")
#def webapps():
#    return render_template('webapps.html', title = "Webapps")






if __name__ == '__main__':
    app.run(debug=True)
