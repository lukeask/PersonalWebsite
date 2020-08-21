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

    #returns data as list
    def return_lines_as_list(self):
        linelist = []
        file = open(self.name, "r")
        for line in file:
            linelist.append(line)
        return linelist



class projectFile(webDataFile):
    def __init__(self, name):
        self.name = "customdatabase/projects/" + name
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

class search:
    def get_class_file_list():
        coursefiles = []
        for filename in os.listdir("customdatabase/courses"):
            coursefiles.append(filename)
        return coursefiles

    def get_class_files_semester(semester, year):
        allfiles = search.get_class_file_list()
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
        filelist = search.get_class_files_semester(semester, year)
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
