# file_object  = open(“filename”, “mode”) where file_object is the variable to add the file object.
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

class courseFile(webDataFile):
    def __init__(self, name):
        self.name = "courses/" + name
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

    #returns data as list
    def return_lines_as_list(self):
        linelist = []
        file = open(self.name, "r")
        for line in file:
            linelist.append(line)
        return linelist



class projectFile(webDataFile):
    def __init__(self, name):
        self.name = "projects/" + name
        self.created = date.today()

    def init_project(self):
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


class file_tests:
    def test_coursefile_init():
        math317 = courseFile("math317.txt")
        math317.init_course("317", "Intro to Analysis", "sequences", "Fall", "2019")

    def test_get_line():
        math317 = courseFile("math317.txt")
        math317.init_course("317", "Intro to Analysis", "sequences", "Fall", "2019")
        print(math317.get_line(2))
        print(math317.get_line(3))

    def test_rewrite_line():
        math317 = courseFile("math317.txt")
        math317.init_course("317", "Intro to Analysis", "sequences", "Fall", "2019")
        math317.rewrite_line(0, "318")

    def print_courses():
        coursetitles = []
        for filename in os.listdir("courses"):
            coursefile = courseFile(filename)
            # janky but removes the /n
            coursetitles.append(coursefile.get_line(1)[0:-1])
        import pdb; pdb.set_trace()
        for coursetitle in coursetitles:
            print(coursetitle)





user_interface.create_course()
