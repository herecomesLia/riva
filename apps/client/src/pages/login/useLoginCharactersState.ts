import { useState } from "react"

export function useLoginCharactersState() {
  const [showPassword, setShowPassword] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [password, setPassword] = useState("")

  function handleUsernameFocus() {
    setIsTyping(true)
  }

  function handleUsernameBlur() {
    setIsTyping(false)
  }

  function handlePasswordChange(nextPassword: string) {
    setPassword(nextPassword)
  }

  function togglePasswordVisibility() {
    setShowPassword((current) => !current)
  }

  return {
    charactersProps: {
      isTyping,
      password,
      showPassword,
    },
    formProps: {
      onPasswordChange: handlePasswordChange,
      onPasswordVisibilityToggle: togglePasswordVisibility,
      onUsernameBlur: handleUsernameBlur,
      onUsernameFocus: handleUsernameFocus,
      showPassword,
    },
  }
}
