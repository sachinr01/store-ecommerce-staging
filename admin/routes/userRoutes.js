const express = require("express");
const router  = express.Router();
const { isAuthenticated } = require("../middleware/auth");
const {
  showUsers,
  showAddUser,
  storeUser,
  showEditUser,
  updateUser,
  deleteUser,
} = require("../controllers/userController");

router.get("/users",            isAuthenticated, showUsers);
router.get("/users/add",        isAuthenticated, showAddUser);
router.post("/users",     isAuthenticated, storeUser);
router.get("/users/edit/:id",   isAuthenticated, showEditUser);
router.post("/users/update/:id",isAuthenticated, updateUser);
router.post("/users/delete/:id",isAuthenticated, deleteUser);

module.exports = router;