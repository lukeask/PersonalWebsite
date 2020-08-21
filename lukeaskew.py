from flask import Flask, render_template, url_for
import customdatabase.database as dbs



app = Flask(__name__)

@app.route("/")
@app.route("/home")
def home():
    return render_template('home.html')


@app.route("/projects")
def projects():
    return render_template('projects.html', title = "Projects")

@app.route("/courses")
def courses():
    return render_template('courses.html', title = "Projects", courses = dbs.search.dict_formatted("Fall", "2019"))

@app.route("/cv")
def cv():
    return render_template('cv.html', title = "Projects")

@app.route("/webapps")
def webapps():
    return render_template('webapps.html', title = "Webapps")






if __name__ == '__main__':
    app.run(debug=True)
