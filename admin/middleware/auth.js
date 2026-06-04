const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.admin) {
        return next();
    }
    res.redirect('/admin/login');
};

module.exports = { isAuthenticated };