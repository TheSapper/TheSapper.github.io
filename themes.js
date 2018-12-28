// Script needed for dark/light theme-selection and saving:
function toggleTheme(){
	var body = document.getElementById('body');
	var currentClass = body.className;
	body.className = currentClass == "dark-mode" ? "light-mode" : "dark-mode";
	localStorage.setItem("theme",body.className);
}
function checkTheme(){
	if (!localStorage.getItem("theme")){
		localStorage.setItem("theme",document.getElementById('body').className);
	} else {
		document.getElementById('body').className = localStorage.getItem("theme");
	}
}
