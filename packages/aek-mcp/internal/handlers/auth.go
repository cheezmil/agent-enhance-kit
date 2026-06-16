package handlers

import (
	"net/http"
	"regexp"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/cheezmil/aek-mcp/internal/config"
	"github.com/cheezmil/aek-mcp/internal/models"
	"github.com/cheezmil/aek-mcp/internal/services"
	"golang.org/x/crypto/bcrypt"
)

func isDefaultPassword(password string) bool {
	defaults := []string{"admin123", "admin"}
	for _, d := range defaults {
		if password == d {
			return true
		}
	}
	return false
}

func validatePasswordStrength(password string) bool {
	if len(password) < 8 {
		return false
	}
	hasLetter, _ := regexp.MatchString(`[a-zA-Z]`, password)
	hasNumber, _ := regexp.MatchString(`[0-9]`, password)
	hasSpecial, _ := regexp.MatchString(`[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]`, password)
	return hasLetter && hasNumber && hasSpecial
}

func generateToken(user *models.User) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"username": user.Username,
		"role":     user.Role,
		"exp":      time.Now().Add(24 * time.Hour).Unix(),
	})
	return token.SignedString([]byte(config.AppConfig.JWTSecret))
}

func Login(c *gin.Context) {
	var req models.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Invalid request body",
		})
		return
	}

	user := services.Store.GetUser(req.Username)
	if user == nil {
		c.JSON(http.StatusUnauthorized, models.ApiResponse{
			Success: false,
			Message: "Invalid credentials",
		})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, models.ApiResponse{
			Success: false,
			Message: "Invalid credentials",
		})
		return
	}

	tokenString, err := generateToken(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ApiResponse{
			Success: false,
			Message: "Failed to generate token",
		})
		return
	}

	isDefault := isDefaultPassword(req.Password)
	message := ""
	if isDefault {
		message = "Warning: You are using a default password. Please change it immediately."
	}

	c.JSON(http.StatusOK, models.AuthResponse{
		Success: true,
		Token:   tokenString,
		User:    user,
		Message: message,
	})
}

func Register(c *gin.Context) {
	var req models.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Invalid request body",
		})
		return
	}

	if !validatePasswordStrength(req.Password) {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Password must be at least 8 characters with at least one letter, one number, and one special character",
		})
		return
	}

	if services.Store.GetUser(req.Username) != nil {
		c.JSON(http.StatusConflict, models.ApiResponse{
			Success: false,
			Message: "Username already exists",
		})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ApiResponse{
			Success: false,
			Message: "Failed to hash password",
		})
		return
	}

	user := &models.User{
		Username:  req.Username,
		Password:  string(hashedPassword),
		Role:      "user",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	services.Store.CreateUser(user)

	tokenString, err := generateToken(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ApiResponse{
			Success: false,
			Message: "Failed to generate token",
		})
		return
	}

	c.JSON(http.StatusOK, models.AuthResponse{
		Success: true,
		Token:   tokenString,
		User:    user,
	})
}

func GetCurrentUser(c *gin.Context) {
	username, _ := c.Get("username")
	user := services.Store.GetUser(username.(string))
	if user == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{
			Success: false,
			Message: "User not found",
		})
		return
	}

	c.JSON(http.StatusOK, models.AuthResponse{
		Success: true,
		User:    user,
	})
}

func GetAuthUser(c *gin.Context) {
	GetCurrentUser(c)
}

func ChangePassword(c *gin.Context) {
	var req models.ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Invalid request body",
		})
		return
	}

	username, _ := c.Get("username")
	user := services.Store.GetUser(username.(string))
	if user == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{
			Success: false,
			Message: "User not found",
		})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.CurrentPassword)); err != nil {
		c.JSON(http.StatusUnauthorized, models.ApiResponse{
			Success: false,
			Message: "Current password is incorrect",
		})
		return
	}

	if !validatePasswordStrength(req.NewPassword) {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "New password must be at least 8 characters with at least one letter, one number, and one special character",
		})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ApiResponse{
			Success: false,
			Message: "Failed to hash password",
		})
		return
	}

	user.Password = string(hashedPassword)
	user.UpdatedAt = time.Now()
	services.Store.UpdateUser(user.Username, user)

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Message: "Password changed successfully",
	})
}

func GetUsers(c *gin.Context) {
	users := services.Store.GetAllUsers()
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    users,
	})
}

func GetUser(c *gin.Context) {
	username := c.Param("username")
	user := services.Store.GetUser(username)
	if user == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{
			Success: false,
			Message: "User not found",
		})
		return
	}

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    user,
	})
}

func CreateUser(c *gin.Context) {
	var req models.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Invalid request body",
		})
		return
	}

	if !validatePasswordStrength(req.Password) {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Password must be at least 8 characters with at least one letter, one number, and one special character",
		})
		return
	}

	if services.Store.GetUser(req.Username) != nil {
		c.JSON(http.StatusConflict, models.ApiResponse{
			Success: false,
			Message: "Username already exists",
		})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ApiResponse{
			Success: false,
			Message: "Failed to hash password",
		})
		return
	}

	user := &models.User{
		Username:  req.Username,
		Password:  string(hashedPassword),
		Role:      "user",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	services.Store.CreateUser(user)

	c.JSON(http.StatusCreated, models.ApiResponse{
		Success: true,
		Data:    user,
	})
}

func UpdateUser(c *gin.Context) {
	username := c.Param("username")
	user := services.Store.GetUser(username)
	if user == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{
			Success: false,
			Message: "User not found",
		})
		return
	}

	var req struct {
		Password  string `json:"password"`
		Role      string `json:"role"`
		IsAdmin   *bool  `json:"isAdmin"`
		Email     string `json:"email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Invalid request body",
		})
		return
	}

	if req.Password != "" {
		if !validatePasswordStrength(req.Password) {
			c.JSON(http.StatusBadRequest, models.ApiResponse{
				Success: false,
				Message: "Password must be at least 8 characters with at least one letter, one number, and one special character",
			})
			return
		}
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.ApiResponse{
				Success: false,
				Message: "Failed to hash password",
			})
			return
		}
		user.Password = string(hashedPassword)
	}

	if req.IsAdmin != nil {
		if *req.IsAdmin {
			user.Role = "admin"
		} else {
			user.Role = "user"
		}
	} else if req.Role != "" {
		user.Role = req.Role
	}

	user.UpdatedAt = time.Now()
	services.Store.UpdateUser(username, user)

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data:    user,
	})
}

func DeleteUser(c *gin.Context) {
	username := c.Param("username")
	if services.Store.GetUser(username) == nil {
		c.JSON(http.StatusNotFound, models.ApiResponse{
			Success: false,
			Message: "User not found",
		})
		return
	}

	// Prevent self-deletion
	currentUser, _ := c.Get("username")
	if currentUser.(string) == username {
		c.JSON(http.StatusBadRequest, models.ApiResponse{
			Success: false,
			Message: "Cannot delete yourself",
		})
		return
	}

	services.Store.DeleteUser(username)

	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Message: "User deleted successfully",
	})
}

func GetUserStats(c *gin.Context) {
	users := services.Store.GetAllUsers()
	total := len(users)
	adminCount := 0
	for _, u := range users {
		if u.Role == "admin" {
			adminCount++
		}
	}
	c.JSON(http.StatusOK, models.ApiResponse{
		Success: true,
		Data: map[string]interface{}{
			"totalUsers":    total,
			"adminCount":    adminCount,
			"regularUsers":  total - adminCount,
		},
	})
}
