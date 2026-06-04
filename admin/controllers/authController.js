const db = require('../config/db');
const bcrypt = require('bcryptjs');

const showLogin = (req, res) => {
    if (req.session && req.session.admin) {
        return res.redirect('/admin/dashboard');
    }
    res.render('auth/login', { error: null });
};

const login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await db.query(
            'SELECT * FROM tbl_users WHERE user_email = ? AND user_status = 0',
            [email]
        );

        if (rows.length === 0) {
            return res.render('auth/login', { error: 'Invalid email or password' });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.user_pass);

        if (!isMatch) {
            return res.render('auth/login', { error: 'Invalid email or password' });
        }

        const [metaRows] = await db.query(
            'SELECT meta_value FROM tbl_usermeta WHERE user_id = ? AND meta_key = ?',
            [user.ID, 'role']
        );

        const role = metaRows.length > 0 ? metaRows[0].meta_value : 'user';

        req.session.admin = {
            id:       user.ID,
            name:     user.display_name,
            email:    user.user_email,
            username: user.user_login,
            role:     role
        };

        res.redirect('/admin/dashboard');

    } catch (error) {
        console.error('Login Error:', error.message);
        res.render('auth/login', { error: 'Something went wrong. Try again.' });
    }
};

const logout = (req, res) => {
    req.session.destroy(() => {
        res.redirect('/admin/login');
    });
};

module.exports = { showLogin, login, logout };