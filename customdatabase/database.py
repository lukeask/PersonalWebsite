# DO NOT RUN FROM INSIDE THIS FILE, USE test.py FOR PROPER PATHS
#used for initializing file objects, logging TODO
from datetime import date
import os

class webDataFile:
    # initializes file with filename
    def __init__(self, name):
        self.name = name
        self.created = date.today()

    #creates / wipes the file
    def create_file(self):
        file = open(self.name, "w")
        file.close()

    #adds a line at the end of the file
    def append_line(self,text):
        file = open(self.name,"a")
        file.write(text + "\n")
        file.close()

    #rewrites a line in a file
    def rewrite_line(self, line_number, text):
        linelist = []
        file = open(self.name, "r")
        for line in file:
            linelist.append(line)
        linelist[line_number] = text + "\n"
        self.create_file()
        for line in linelist:
            file = open(self.name,"a")
            file.write(line)
            file.close()

    #returns a line
    def get_line(self, line_int):
        linelist = []

        file = open(self.name, "r")
        for line in file:
            linelist.append(line)
        return_line = linelist[line_int]
        file.close()
        return return_line

    def delete_file(self):
        pass

    #returns lines as a list in the form [line0, line1, ...]
    def return_lines_as_list(self):
        linelist = []
        file = open(self.name, "r")
        for line in file:
            linelist.append(line)
        return linelist

#allows for interaction with course files for courses.html, defines file format
class courseFile(webDataFile):
    def __init__(self, name):
        self.name = "customdatabase/courses/" + name
        self.created = date.today()

    # creates a course file entry in the courses directory
    def init_course(self, course_number, course_name, course_description, course_semester, course_year, course_text, course_author):
        self.create_file()
        self.append_line(course_number)
        self.append_line(course_name)
        self.append_line(course_description)
        self.append_line(course_semester)
        self.append_line(course_year)
        self.append_line(course_text)
        self.append_line(course_author)

    def edit_course(self, selection, new_string):
        pass

#class for projects to appear on projects.html
class projectFile(webDataFile):
    def __init__(self, name):
        self.name = "customdatabase/projects/" + name
        self.created = date.today()

    def init_project(self, project_title, project_description, project_PDF_address, project_pride):
        self.create_file()
        self.append_line(project_title)
        self.append_line(project_description)
        #TODO projects with no PDF?
        self.append_line(project_PDF_address)
        self.append_line(project_pride)

    def edit_project(self):
        pass

#TODO move to own file
class user_interface:
    def create_course():
        #get course info
        course_number = input("Enter Course Number:")
        course_name = input("Enter Course Name:")
        course_description = input("Enter Course Description:")
        course_semester = input("Enter Course Semester (Fall/Spring/Summer):")
        course_year = input("Enter Course Year:")
        course_text = input("Enter Textbook Title:")
        course_author = input("Enter Textbook Author:")
        #save to file named coursenumber
        newcourse = courseFile(course_number)
        newcourse.init_course(course_number, course_name, course_description, course_semester, course_year, course_text, course_author)

    def create_project():
        project_title = input("Enter Project Title")
        project_description = input("Enter Project Description")
        project_pdf_link = input("Enter Project Link")
        project_pride = input("Enter Pride in Project (1-5 int value, 5 is proud)")
        newproject = projectFile(project_title)
        newproject.init_project(project_title, project_description, project_pdf_link, project_pride)

class course_search:
    def get_class_file_list():
        coursefiles = []
        for filename in os.listdir("customdatabase/courses"):
            coursefiles.append(filename)
        return coursefiles

    def get_class_files_semester(semester, year):
        allfiles = course_search.get_class_file_list()
        matchinglist = []
        for filename in allfiles:
            coursefile = courseFile(filename)
            # import pdb; pdb.set_trace()
            if coursefile.get_line(3)[0:-1] == semester and coursefile.get_line(4)[0:-1] == year:
                matchinglist.append(filename)
            else:
                continue
        return matchinglist


    def dict_formatted(semester, year):
        # return a list of dictionaries with needed data for frontend
        dictlist = []
        filelist = course_search.get_class_files_semester(semester, year)
        for filename in filelist:
            coursefile = courseFile(filename)

            newdict = {
            'number': coursefile.get_line(0)[0:-1],
            'name': coursefile.get_line(1)[0:-1],
            'description': coursefile.get_line(2)[0:-1],
            'semester': coursefile.get_line(3)[0:-1],
            'year ': coursefile.get_line(4)[0:-1],
            'text': coursefile.get_line(5)[0:-1],
            'author': coursefile.get_line(6)[0:-1]
            }
            dictlist.append(newdict)
        return dictlist

    def get_semester_list():
        allfiles = course_search.get_class_file_list()
        matchinglist = []
        for filename in allfiles:
            coursefile = courseFile(filename)
            i = [coursefile.get_line(3)[0:-1], coursefile.get_line(4)[0:-1]]
            if i not in matchinglist:
                matchinglist.append(i)
        return matchinglist

    def full_course_dict_old():
        final_dict_list = []
        for semester in course_search.get_semester_list():
            #import pdb; pdb.set_trace()
            for dict in course_search.dict_formatted(semester[0], semester[1]):
                final_dict_list.append(dict)
        return final_dict_list

    def full_dict_list():
        allfiles = course_search.get_class_file_list()
        dictlist = []
        for filename in allfiles:
            coursefile = courseFile(filename)
            newdict = {
            'number': coursefile.get_line(0)[0:-1],
            'name': coursefile.get_line(1)[0:-1],
            'description': coursefile.get_line(2)[0:-1],
            'semester': coursefile.get_line(3)[0:-1],
            'year': coursefile.get_line(4)[0:-1],
            'text': coursefile.get_line(5)[0:-1],
            'author': coursefile.get_line(6)[0:-1]
            }
            dictlist.append(newdict)
        return dictlist

class project_search:
    def get_project_file_list():
        projectfiles = []
        for filename in os.listdir("customdatabase/projects"):
            projectfiles.append(filename)
        return projectfiles

    def dict_formatted():
        # return a list of dictionaries with needed data for frontend
        dictlist = []
        filelist = project_search.get_project_file_list()
        for filename in filelist:
            projectfile = projectFile(filename)

            newdict = {
            'title': projectfile.get_line(0)[0:-1],
            'description': projectfile.get_line(1)[0:-1],
            'pdf_link': projectfile.get_line(2)[0:-1],
            'pride_score': projectfile.get_line(3)[0:-1],
            }
            dictlist.append(newdict)
        return dictlist

class file_tests:
    def test_coursefile_init():
        math317 = courseFile("math317.txt")
        math317.init_course("317", "Intro to Analysis", "sequences", "Fall", "2019", "", "")

    def test_get_line():
        math317 = courseFile("math317.txt")
        math317.init_course("317", "Intro to Analysis", "sequences", "Fall", "2019", "", "")
        print(math317.get_line(2))
        print(math317.get_line(3))

    def test_rewrite_line():
        math317 = courseFile("math317.txt")
        math317.init_course("317", "Intro to Analysis", "sequences", "Fall", "2019", "", "")
        math317.rewrite_line(0, "318")

    def print_courses():
        coursetitles = []
        # directory from lukeaskew.py
        for filename in os.listdir("customdatabase/courses"):
            coursefile = courseFile(filename)
            # janky but removes the /n
            coursetitles.append(coursefile.get_line(1)[0:-1])
        for coursetitle in coursetitles:
            print(coursetitle)

    def matching_test():
        listmatching = search.get_class_files_semester("Spring", "2020")
        for item in listmatching:
            print(item)

    def project_test():
        thiswebsite = projectFile("thissite")
        thiswebsite.init_project("This Website", "This website was written using Flask and is hosted on a virtual private server. Website updates are tested using a simulated copy of my VPS on my homelab virtualization server", "lukeaskew.xyz", "2")
