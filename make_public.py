def main():
    #check if we need to make a change

    lines = open("lukeaskew.py", "r").readlines()
    if lines[-1] == "    app.run(debug=True)\n":
        new_last_line = "#    app.run(debug=True)\n"
        new_second_to_last_line = "    app.run(debug=False, port = 80, host = \"0.0.0.0\")\n"
        lines[-1] = new_last_line
        lines[-2] = new_second_to_last_line
        open("lukeaskew.py", "w").writelines(lines)

if __name__ == '__main__':
    main()
