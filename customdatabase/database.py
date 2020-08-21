# file_object  = open(“filename”, “mode”) where file_object is the variable to add the file object.
from datetime import date

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
        pass

    #need_to_test
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
    def init_course(self, course_number, course_name, course_description, course_semester, course_year):
        self.create_file()
        self.append_line(course_number)
        self.append_line(course_name)
        self.append_line(course_description)
        self.append_line(course_semester)
        self.append_line(course_year)

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
        #save to file named coursenumber
        newcourse = courseFile(course_number)
        newcourse.init_course(course_number, course_name, course_description, course_semester, course_year)


class file_tests:
    def test_coursefile_init():
        math317 = courseFile("math317.txt")
        math317.init_course("317", "Intro to Analysis", "sequences", "Fall", "2019")

    def test_get_line():
        math317 = courseFile("math317.txt")
        math317.init_course("317", "Intro to Analysis", "sequences", "Fall", "2019")
        print(math317.get_line(2))
        print(math317.get_line(3))

user_interface.create_course()
