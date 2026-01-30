let gender = "male";

const maleBtn = document.getElementById("maleBtn");
const femaleBtn = document.getElementById("femaleBtn");
const enterBtn = document.getElementById("enterBtn");
const nameInput = document.getElementById("nameInput");

const imgUpload = document.getElementById("imgUpload");
const previewImg = document.getElementById("previewImg");
const useAvatarBtn = document.getElementById("useAvatarBtn");

maleBtn.onclick = () => {
  gender = "male";
  maleBtn.classList.add("btn-red");
  femaleBtn.classList.remove("btn-red");
};

femaleBtn.onclick = () => {
  gender = "female";
  femaleBtn.classList.add("btn-red");
  maleBtn.classList.remove("btn-red");
};

useAvatarBtn.onclick = () => {
  localStorage.removeItem("rageImage");
  if (previewImg) previewImg.style.display = "none";
  if (imgUpload) imgUpload.value = "";
};

// Preview only (doesn't need to save yet)
imgUpload.onchange = () => {
  const file = imgUpload.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    if (previewImg) {
      previewImg.src = reader.result;
      previewImg.style.display = "block";
    }
  };
  reader.readAsDataURL(file);
};

// ENTER: if file selected, read + save THEN redirect
enterBtn.onclick = () => {
  const name = nameInput.value || "TARGET";
  localStorage.setItem("rageName", name);
  localStorage.setItem("rageGender", gender);

  const file = imgUpload.files?.[0];

  // If no upload, go straight in
  if (!file) {
    window.location.href = "room.html";
    return;
  }

  // If upload selected, store it first then go in
  const reader = new FileReader();
  reader.onload = () => {
    localStorage.setItem("rageImage", reader.result);
    window.location.href = "room.html";
  };
  reader.readAsDataURL(file);
};
