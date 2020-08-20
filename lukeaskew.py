from flask import Flask, render_template, url_for


posts = [
    {
    'author': 'Luke',
    'title': 'Blog Post',
    'content': 'Content is in here hahahahah',
    'date_posted': 'today'
    },
    {
    'author': 'uke',
    'title': 'Blog Post 2',
    'content': 'Content is2222222 in here hahahahah',
    'date_posted': 'toda22y'
    },
]


app = Flask(__name__)

@app.route("/")
@app.route("/home")
def home():
    return render_template('home.html', posts=posts)


@app.route("/projects")
def projects():
    return render_template('projects.html', title = "Projects")

@app.route("/courses")
def courses():
    return render_template('courses.html', title = "Projects", courses = posts)

@app.route("/cv")
def cv():
    return render_template('cv.html', title = "Projects")

@app.route("/webapps")
def webapps():
    return render_template('webapps.html', title = "Webapps")






if __name__ == '__main__':
    app.run(debug=True)
